(() => {
  const COLLECTOR_VERSION = "0.2.2";
  const INJECTED_SELECTORS = [
    "#custom-insertion-point",
    ".mz-widget-product",
    "sider-trans",
    "sider-trans-inline",
    "sider-trans-text",
    "[name='market-mate-for-1688']",
  ].join(",");

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function numberOrNull(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const match = String(value || "").replace(/\s+/g, "").match(/-?\d+(?:[.,]\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0].replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function productIdFromUrl(value) {
    const url = String(value || "");
    return url.match(/(\d{6,})(?:\/)?(?:[?#]|$)/)?.[1] || "";
  }

  function absoluteUrl(value, baseUrl = location.href) {
    if (!value || String(value).startsWith("data:")) return "";
    try {
      return new URL(value, baseUrl).toString();
    } catch {
      return "";
    }
  }

  function normalizeOzonMediaUrl(value, baseUrl = location.href) {
    const absolute = absoluteUrl(value, baseUrl);
    if (!absolute || !/ozone\.ru|ozonstatic\.(?:ru|cn)|ozonusercontent/i.test(absolute)) return "";
    try {
      const parsed = new URL(absolute);
      parsed.pathname = parsed.pathname.replace(/\/wc\d+\//gi, "/");
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return absolute;
    }
  }

  function cloneWithoutInjectedUi(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(INJECTED_SELECTORS).forEach((element) => element.remove());
    return clone;
  }

  function nativePageText(doc = document) {
    const root = doc.querySelector("#__ozon") || doc.body || doc.documentElement;
    if (!root) return "";
    return cleanText(cloneWithoutInjectedUi(root).textContent).slice(0, 30000);
  }

  function flattenJsonLd(value, target = []) {
    if (!value) return target;
    if (Array.isArray(value)) {
      value.forEach((item) => flattenJsonLd(item, target));
      return target;
    }
    if (typeof value !== "object") return target;
    target.push(value);
    if (Array.isArray(value["@graph"])) value["@graph"].forEach((item) => flattenJsonLd(item, target));
    return target;
  }

  function parseJsonLd(doc = document) {
    const values = [];
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        flattenJsonLd(JSON.parse(script.textContent || ""), values);
      } catch {
        // Invalid structured-data blocks are ignored and reported through pending fields.
      }
    }
    return values;
  }

  function productJsonLd(doc = document) {
    return parseJsonLd(doc).find((item) => {
      const type = item?.["@type"];
      return type === "Product" || (Array.isArray(type) && type.includes("Product"));
    }) || null;
  }

  function widgetState(doc, widgetName) {
    const stateElement = doc.querySelector(`[id^="state-${widgetName}-"][data-state]`);
    if (!stateElement) return null;
    try {
      return JSON.parse(stateElement.getAttribute("data-state") || "");
    } catch {
      return null;
    }
  }

  function readNuxtState() {
    let state = globalThis.__NUXT__?.state;
    if (typeof state === "string") {
      try {
        state = JSON.parse(state);
      } catch {
        return null;
      }
    }
    return state && typeof state === "object" ? state : null;
  }

  function cleanHierarchyPart(value) {
    const text = cleanText(value);
    const trackingLabel = text.match(/^\{\{\{([^|}]+)\|[^}]+\}\}\}$/);
    return cleanText(trackingLabel?.[1] || text);
  }

  function categoryPathFromNuxt(brand) {
    const hierarchy = cleanText(readNuxtState()?.layoutTrackingInfo?.hierarchy);
    if (!hierarchy) return [];
    const parts = hierarchy.split("/").map(cleanHierarchyPart).filter(Boolean);
    if (brand && parts.at(-1)?.toLowerCase() === String(brand).toLowerCase()) parts.pop();
    return parts;
  }

  function categoryIdsFromBreadcrumbs(doc = document) {
    return unique(
      [...doc.querySelectorAll('[data-widget="breadCrumbs"] a[href*="/category/"]')]
        .map((link) => link.getAttribute("href")?.match(/-(\d+)(?:\/|$)/)?.[1] || "")
        .filter(Boolean),
    );
  }

  function currentSourceLocale(doc = document) {
    const languageCookie = doc.cookie
      ?.split("; ")
      .find((item) => item.startsWith("x-hng="))
      ?.slice("x-hng=".length)
      .match(/(?:^|&)lang=([^&]+)/)?.[1];
    return cleanText(languageCookie || doc.documentElement?.lang || "unknown");
  }

  function extractMeta(doc = document) {
    const entries = [...doc.querySelectorAll("meta[name], meta[property]")]
      .map((item) => [
        item.getAttribute("name") || item.getAttribute("property"),
        cleanText(item.getAttribute("content")),
      ])
      .filter(([key, value]) => key && value)
      .slice(0, 100);
    return Object.fromEntries(entries);
  }

  function extractGallery(doc = document, baseUrl = location.href) {
    const gallery = doc.querySelector('[data-widget="webGallery"]');
    const state = widgetState(doc, "webGallery");
    if (!gallery && !state) return { images: [], videoCovers: [], videos: [] };

    const imageCandidates = (state?.images || []).map((image) => image?.src || "");
    for (const image of gallery?.querySelectorAll("img") || []) {
      imageCandidates.push(image.currentSrc || image.getAttribute("src") || "");
      const srcset = image.getAttribute("srcset") || "";
      for (const part of srcset.split(",")) imageCandidates.push(part.trim().split(/\s+/)[0]);
    }

    const normalized = unique(imageCandidates.map((url) => normalizeOzonMediaUrl(url, baseUrl)));
    const videoCovers = unique([
      ...normalized.filter((url) => /\/video-[^/]+\/.+\/cover\//i.test(url)),
      ...(state?.videos || []).map((video) => normalizeOzonMediaUrl(video?.coverUrl, baseUrl)),
    ]);
    const images = normalized.filter((url) => /\/multimedia-/i.test(url));
    const videos = unique(
      [
        ...(state?.videos || []).map((video) => video?.url || ""),
        ...[...(gallery?.querySelectorAll("video, source") || [])]
        .flatMap((element) => [
          element.currentSrc || element.getAttribute("src") || "",
          element.getAttribute("data-src") || "",
        ]),
      ]
        .map((url) => absoluteUrl(url, baseUrl))
        .filter((url) => /\.(?:mp4|webm)(?:$|\?)/i.test(url)),
    );

    return { images, videoCovers, videos };
  }

  function extractShortAttributes(doc = document) {
    const widget = doc.querySelector('[data-widget="webShortCharacteristics"]');
    const state = widgetState(doc, "webShortCharacteristics");
    if (!widget && !state) return [];

    const attributes = [];
    for (const characteristic of state?.characteristics || []) {
      const name = cleanText(
        (characteristic?.title?.textRs || []).map((part) => part?.content || "").join(""),
      );
      const value = cleanText(
        (characteristic?.values || []).map((part) => part?.text || "").join(""),
      );
      if (!name || !value || name === value) continue;
      attributes.push({
        attributeId: cleanText(characteristic?.id) || null,
        name,
        value,
        source: "state:webShortCharacteristics",
        status: "collected",
        confidence: 98,
      });
    }

    for (const row of attributes.length ? [] : widget?.querySelectorAll("div") || []) {
      if (row.children.length !== 2) continue;
      const name = cleanText(row.children[0]?.textContent);
      const value = cleanText(row.children[1]?.textContent);
      if (!name || !value || name === value) continue;
      if (name.length > 120 || value.length > 500) continue;
      if (/^(?:О товаре|关于商品)$/i.test(name) || /Перейти к описанию|前往描述/i.test(`${name} ${value}`)) continue;
      attributes.push({
        attributeId: null,
        name,
        value,
        source: "dom:webShortCharacteristics",
        status: "collected",
        confidence: 95,
      });
    }

    const byName = new Map();
    for (const attribute of attributes) {
      const key = attribute.attributeId || attribute.name;
      if (!byName.has(key) || attribute.source.startsWith("state:")) byName.set(key, attribute);
    }
    return [...byName.values()];
  }

  function extractFullAttributes(doc = document) {
    const attributes = [];
    for (const widget of doc.querySelectorAll('[data-widget="webCharacteristics"]')) {
      const cleanWidget = cloneWithoutInjectedUi(widget);
      for (const row of cleanWidget.querySelectorAll("dl")) {
        const name = cleanText(row.querySelector("dt")?.textContent);
        const value = cleanText(row.querySelector("dd")?.textContent);
        if (!name || !value || name === value) continue;
        if (name.length > 120 || value.length > 1000) continue;
        if (/^(?:SKU|Артикул|货号|商品编号)$/i.test(name)) continue;
        attributes.push({
          attributeId: null,
          name,
          value,
          source: "dom:webCharacteristics",
          status: "collected",
          confidence: 95,
        });
      }
    }
    return attributes;
  }

  function mergeAttributes(...groups) {
    const byName = new Map();
    for (const attribute of groups.flat()) {
      const key = cleanText(attribute?.name).toLocaleLowerCase();
      if (!key) continue;
      const existing = byName.get(key);
      if (!existing || String(attribute.source || "").startsWith("state:")) {
        byName.set(key, attribute);
      }
    }
    return [...byName.values()];
  }

  function extractHashtags(doc = document) {
    const candidates = [];
    for (const widget of doc.querySelectorAll('[data-widget="webHashtags"]')) {
      const cleanWidget = cloneWithoutInjectedUi(widget);
      for (const element of cleanWidget.querySelectorAll("[title]")) {
        candidates.push(cleanText(element.getAttribute("title")));
      }
      candidates.push(...((cleanWidget.textContent || "").match(/#[^\s#]+/g) || []));
    }
    return unique(
      candidates
        .map((value) => cleanText(value).match(/^#[\p{L}\p{N}_-]+/u)?.[0] || "")
        .filter(Boolean),
    ).slice(0, 30);
  }

  function extractDescriptionSections(doc = document) {
    const descriptions = [];
    const packageContents = [];

    for (const widget of doc.querySelectorAll('[data-widget="webDescription"]')) {
      const cleanWidget = cloneWithoutInjectedUi(widget);
      cleanWidget.querySelectorAll('[data-widget="webTranslateButton"], button').forEach((element) => element.remove());
      const heading = cleanText(cleanWidget.querySelector("h2, h3")?.textContent);
      const lines = (cleanWidget.innerText || cleanWidget.textContent || "")
        .split(/\r?\n/)
        .map(cleanText)
        .filter(Boolean)
        .filter((line) => line !== heading && !/^(?:翻译|Перевести)$/i.test(line));
      if (!lines.length) continue;

      const marker = heading || lines[0];
      if (/^(?:配套|Комплектац|Комплект поставки|Package contents)/i.test(marker)) {
        if (!heading) lines.shift();
        const value = cleanText(lines.join("; "))
          .replace(/^(?:配套|Комплектац(?:ия|ии)?|Комплект поставки|Package contents)\s*/i, "")
          .replace(/\s*;+\s*/g, "; ")
          .replace(/^;+|;+$/g, "")
          .trim();
        if (value) packageContents.push(value);
        continue;
      }

      const value = cleanText(lines.join(" "));
      if (value) descriptions.push(value);
    }

    return {
      descriptionText: descriptions.sort((a, b) => b.length - a.length)[0] || "",
      packageContentsText: packageContents.sort((a, b) => b.length - a.length)[0] || "",
    };
  }

  function currentAspectValue(doc = document, aspectName = "Цвет") {
    const state = widgetState(doc, "webAspects");
    const activeVariant = state?.aspects
      ?.flatMap((aspect) => aspect?.variants || [])
      .find((variant) => variant?.active);
    const stateValue = cleanText(activeVariant?.data?.searchableText);
    if (stateValue) return stateValue.slice(0, 160);

    const widget = doc.querySelector('[data-widget="webAspects"]');
    if (!widget) return "";
    const selected = [...widget.querySelectorAll("[title]")].find((element) => !element.closest("a"));
    const selectedTitle = cleanText(selected?.getAttribute("title"));
    if (selectedTitle) return selectedTitle.slice(0, 160);

    const lines = (widget.innerText || "")
      .split(/\r?\n/)
      .map(cleanText)
      .filter(Boolean);
    const labelIndex = lines.findIndex((line) => new RegExp(`^${aspectName}\\s*:?$`, "i").test(line));
    return labelIndex >= 0 ? cleanText(lines[labelIndex + 1]).slice(0, 160) : "";
  }

  function extractVariantReferences(doc, currentSku, currentUrl) {
    const widget = doc.querySelector('[data-widget="webAspects"]');
    const state = widgetState(doc, "webAspects");
    const refs = [];
    const currentColor = currentAspectValue(doc);

    refs.push({
      sku: currentSku,
      url: currentUrl,
      isCurrent: true,
      options: currentColor ? [{ name: "Цвет", value: currentColor }] : [],
    });

    for (const aspect of state?.aspects || []) {
      const optionName = cleanText(aspect?.aspectName) || "Option";
      for (const variant of aspect?.variants || []) {
        const sku = cleanText(variant?.sku);
        const url = absoluteUrl(variant?.link, currentUrl);
        if (!sku || sku === currentSku) continue;
        const optionValue = cleanText(variant?.data?.searchableText);
        refs.push({
          sku,
          url,
          isCurrent: false,
          options: optionValue ? [{ name: optionName, value: optionValue }] : [],
        });
      }
    }

    if (widget) {
      for (const link of widget.querySelectorAll('a[href*="/product/"]')) {
        const url = absoluteUrl(link.getAttribute("href"), currentUrl);
        const sku = productIdFromUrl(url);
        if (!sku || sku === currentSku) continue;
        const color = cleanText(link.getAttribute("title"));
        refs.push({
          sku,
          url,
          isCurrent: false,
          options: color ? [{ name: "Цвет", value: color }] : [],
        });
      }
    }

    const bySku = new Map();
    for (const item of refs) bySku.set(item.sku || item.url, item);
    return [...bySku.values()];
  }

  function extractPrice(doc, jsonLd) {
    const widget = doc.querySelector('[data-widget="webPrice"]');
    const raw = widget ? cleanText(cloneWithoutInjectedUi(widget).textContent) : "";
    const values = [];
    const patterns = [
      { currency: "CNY", regex: /(\d[\d\s]*[.,]\d{1,2})\s*[¥￥]/g },
      { currency: "RUB", regex: /(\d[\d\s]*[.,]?\d*)\s*₽/g },
    ];

    for (const { currency, regex } of patterns) {
      for (const match of raw.matchAll(regex)) {
        const amount = numberOrNull(match[1]);
        if (amount !== null) values.push({ amount, currency, raw: cleanText(match[0]), source: "dom:webPrice" });
      }
    }

    const structuredAmount = numberOrNull(jsonLd?.offers?.price);
    const structuredCurrency = cleanText(jsonLd?.offers?.priceCurrency) || null;
    const structured = structuredAmount === null
      ? null
      : {
          amount: structuredAmount,
          currency: structuredCurrency,
          source: "json-ld:Product.offers",
        };

    return {
      current: values[0] || structured,
      structured,
      observed: values,
      rawText: raw.slice(0, 1000),
      meaning: "competitor_sale_price",
    };
  }

  function parsePackage(attributes) {
    const normalized = attributes.map((item) => ({
      ...item,
      search: `${item.name} ${item.value}`.toLowerCase(),
    }));
    const weightEntry = normalized.find((item) =>
      /вес.*упаков|вес товара.*упаков|package.*weight|含包装重量|包装重量/.test(item.search),
    );
    const dimensionEntry = normalized.find((item) =>
      /габарит.*упаков|размер.*упаков|package.*(?:size|dimension)|包装尺寸/.test(item.search),
    );

    let weightG = null;
    if (weightEntry) {
      const amount = numberOrNull(weightEntry.value);
      if (amount !== null) {
        weightG = /\bкг\b|kg/i.test(weightEntry.value) ? Math.round(amount * 1000) : Math.round(amount);
      }
    }

    let lengthMm = null;
    let widthMm = null;
    let heightMm = null;
    if (dimensionEntry) {
      const match = dimensionEntry.value.match(
        /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(мм|mm|см|cm)?/i,
      );
      if (match) {
        const multiplier = /см|cm/i.test(match[4] || "") ? 10 : 1;
        lengthMm = Math.round(Number(match[1].replace(",", ".")) * multiplier);
        widthMm = Math.round(Number(match[2].replace(",", ".")) * multiplier);
        heightMm = Math.round(Number(match[3].replace(",", ".")) * multiplier);
      }
    }

    const found = [lengthMm, widthMm, heightMm, weightG].filter((value) => value !== null).length;
    return {
      lengthMm,
      widthMm,
      heightMm,
      weightG,
      status: found === 4 ? "collected" : found > 0 ? "candidate" : "pending",
      source: found ? "native_product_attributes" : null,
      confidence: found === 4 ? 90 : found > 0 ? 60 : 0,
      note: found
        ? "Parsed only from native OZON product attributes; verify that the values describe the packed item."
        : "OZON page did not expose packed dimensions and weight. Manual or supplier confirmation is required.",
    };
  }

  function extractRichContent(doc = document) {
    const blocks = [...doc.scripts]
      .map((script) => script.textContent || "")
      .filter((text) => /raShowcase|richContent/i.test(text));
    const joined = blocks.join("\n").replaceAll("\\/", "/");
    const urls = unique(
      (joined.match(/https?:\/\/[^"'\\\s<>]+/g) || [])
        .map((url) => normalizeOzonMediaUrl(url))
        .filter((url) => /\/multimedia-/i.test(url)),
    );
    return {
      json: blocks[0]?.slice(0, 30000) || null,
      images: urls,
      status: blocks.length ? "collected" : "pending",
      source: blocks.length ? "native_page_script" : null,
    };
  }

  function safeProductLd(value) {
    if (!value) return null;
    return {
      name: cleanText(value.name) || null,
      sku: cleanText(value.sku) || null,
      brand: typeof value.brand === "string" ? cleanText(value.brand) : cleanText(value.brand?.name),
      description: cleanText(value.description) || null,
      image: typeof value.image === "string" ? value.image : Array.isArray(value.image) ? value.image.slice(0, 30) : null,
      offers: value.offers || null,
      aggregateRating: value.aggregateRating || null,
    };
  }

  function variantFromDocument(doc, url, reference = {}) {
    const ld = productJsonLd(doc);
    const sku = cleanText(ld?.sku) || reference.sku || productIdFromUrl(url);
    const media = extractGallery(doc, url);
    const price = extractPrice(doc, ld);
    const color = currentAspectValue(doc);
    return {
      sku,
      title: cleanText(ld?.name) || null,
      url,
      isCurrent: Boolean(reference.isCurrent),
      options: reference.options?.length
        ? reference.options
        : color
          ? [{ name: "Цвет", value: color }]
          : [],
      price: price.current,
      images: media.images,
      videoCover: media.videoCovers[0] || null,
      video: media.videos[0] || null,
      status: "collected",
      source: reference.isCurrent ? "current_page" : "variant_page",
    };
  }

  async function fetchVariant(reference) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(reference.url, {
        credentials: "include",
        signal: controller.signal,
        headers: { accept: "text/html,application/xhtml+xml" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      return variantFromDocument(doc, reference.url, reference);
    } catch (error) {
      return {
        ...reference,
        title: null,
        price: null,
        images: [],
        videoCover: null,
        video: null,
        status: "pending",
        source: "variant_page",
        error: error?.name === "AbortError" ? "variant_fetch_timeout" : String(error?.message || error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  function detectConflicts(title, attributes, pageUrl = "") {
    const conflicts = [];
    const attributeText = attributes.map((item) => `${item.name}: ${item.value}`).join(" | ");
    const titleSaysWireless = /беспровод|无线/i.test(title) || /(?:^|[-_/])besprovodn/i.test(pageUrl);
    const attributesSayWired =
      /тип пылесоса\s*:\s*проводн/i.test(attributeText) ||
      /работа от аккумулятора\s*:\s*(?:нет|не)/i.test(attributeText) ||
      /电池操作\s*:\s*不|吸尘器类型\s*:\s*有线/i.test(attributeText);

    if (titleSaysWireless && attributesSayWired) {
      conflicts.push({
        code: "wireless_title_vs_wired_attributes",
        severity: "high",
        fields: ["title", "attributes"],
        message: "The title says cordless, while product attributes describe a wired/non-battery model.",
      });
    }

    return conflicts;
  }

  async function collect(options = {}) {
    const pageUrl = location.href;
    const pageText = nativePageText(document);
    const ld = productJsonLd(document);
    const productId = cleanText(ld?.sku) || productIdFromUrl(pageUrl);
    const title =
      cleanText(ld?.name) ||
      cleanText(document.querySelector("h1")?.textContent) ||
      cleanText(document.title).replace(/\s+купить на OZON.*$/i, "");
    const brand = typeof ld?.brand === "string" ? cleanText(ld.brand) : cleanText(ld?.brand?.name);
    const categoryPath = categoryPathFromNuxt(brand);
    const categoryIds = categoryIdsFromBreadcrumbs(document);
    const sourceLocale = currentSourceLocale(document);
    const shortAttributes = extractShortAttributes(document);
    const fullAttributes = extractFullAttributes(document);
    const attributes = mergeAttributes(shortAttributes, fullAttributes);
    const descriptionSections = extractDescriptionSections(document);
    const descriptionText = cleanText(ld?.description) || descriptionSections.descriptionText;
    const hashtags = extractHashtags(document);
    const richContent = extractRichContent(document);
    const packageData = parsePackage(attributes);
    const currentGallery = extractGallery(document, pageUrl);
    const price = extractPrice(document, ld);
    const variantReferences = extractVariantReferences(document, productId, pageUrl);
    const currentReference = variantReferences.find((item) => item.isCurrent) || {
      sku: productId,
      url: pageUrl,
      isCurrent: true,
      options: [],
    };
    const currentVariant = variantFromDocument(document, pageUrl, currentReference);
    const deepVariants = options.deepVariants !== false;
    const siblingReferences = variantReferences.filter((item) => !item.isCurrent).slice(0, 11);
    const siblingVariants = deepVariants
      ? await Promise.all(siblingReferences.map(fetchVariant))
      : siblingReferences.map((item) => ({
          ...item,
          title: null,
          price: null,
          images: [],
          videoCover: null,
          video: null,
          status: "pending",
          source: "variant_reference",
        }));
    const variants = [currentVariant, ...siblingVariants];
    const allImages = unique(variants.flatMap((variant) => variant.images || []));
    const allVideoCovers = unique(variants.map((variant) => variant.videoCover).filter(Boolean));
    const allVideos = unique(variants.map((variant) => variant.video).filter(Boolean));
    const conflicts = detectConflicts(title, attributes, pageUrl);
    const questionCount = numberOrNull(pageText.match(/(\d[\d\s]*)\s+вопрос/i)?.[1]);
    const rating = numberOrNull(ld?.aggregateRating?.ratingValue);
    const reviewCount = numberOrNull(ld?.aggregateRating?.reviewCount);

    const pendingFields = [];
    if (!categoryPath.length) pendingFields.push("categoryPath");
    pendingFields.push("categoryId");
    if (!brand) pendingFields.push("brand");
    pendingFields.push("model");
    pendingFields.push("barcode");
    if (!hashtags.length) pendingFields.push("hashtags");
    if (!/^ru(?:-|$)/i.test(sourceLocale)) pendingFields.push("russianListingCopy");
    if (packageData.status !== "collected") pendingFields.push("packageDimensionsWeight");
    if (!descriptionSections.packageContentsText) pendingFields.push("packageContents");
    if (richContent.status !== "collected") pendingFields.push("richContent");
    if (!allVideos.length) pendingFields.push("video");
    if (variants.some((variant) => variant.status !== "collected")) pendingFields.push("variantDetails");

    const evidence = [
      { field: "product.sku", source: ld?.sku ? "json-ld:Product.sku" : "url", status: "collected", confidence: 98 },
      { field: "product.title", source: ld?.name ? "json-ld:Product.name" : "dom:h1", status: title ? "collected" : "pending", confidence: title ? 95 : 0 },
      { field: "product.brand", source: brand ? "json-ld:Product.brand" : "pending", status: brand ? "collected" : "pending", confidence: brand ? 95 : 0 },
      { field: "product.categoryPath", source: categoryPath.length ? "nuxt:layoutTrackingInfo.hierarchy" : "pending", status: categoryPath.length ? "collected" : "pending", confidence: categoryPath.length ? 90 : 0 },
      { field: "product.descriptionText", source: ld?.description ? "json-ld:Product.description" : descriptionSections.descriptionText ? "dom:webDescription" : "pending", status: descriptionText ? "collected" : "pending", confidence: descriptionText ? 95 : 0 },
      { field: "product.attributes", source: "state:webShortCharacteristics + dom:webCharacteristics", status: attributes.length ? "collected" : "pending", confidence: attributes.length ? 95 : 0 },
      { field: "product.media.images", source: "dom:webGallery + variant pages", status: allImages.length ? "collected" : "pending", confidence: allImages.length ? 95 : 0 },
      { field: "product.package", source: packageData.source || "pending", status: packageData.status, confidence: packageData.confidence },
      { field: "product.packageContents", source: descriptionSections.packageContentsText ? "dom:webDescription" : "pending", status: descriptionSections.packageContentsText ? "collected" : "pending", confidence: descriptionSections.packageContentsText ? 90 : 0 },
      { field: "product.hashtags", source: hashtags.length ? "dom:webHashtags" : "pending_ai_generation", status: hashtags.length ? "collected" : "pending", confidence: hashtags.length ? 95 : 0 },
    ];

    const meta = extractMeta(document);
    const currentImages = currentGallery.images;
    const imageUrls = allImages.length ? allImages : currentImages;

    return {
      source: "edge-extension",
      pageType: "ozon",
      url: pageUrl,
      title: document.title,
      data: {
        schemaVersion: 2,
        collector: {
          name: "ozon-structured-product",
          version: COLLECTOR_VERSION,
          collectedAt: new Date().toISOString(),
          deepVariants,
        },
        product: {
          platform: "ozon",
          sourceLocale,
          targetLocale: "ru-RU",
          productId,
          sku: productId,
          sourceUrl: pageUrl,
          canonicalUrl: cleanText(document.querySelector('link[rel="canonical"]')?.href) || null,
          title,
          brand: brand || null,
          categoryPath,
          categoryDisplay: categoryPath.join(" / ") || null,
          categoryIds,
          model: null,
          barcode: null,
          hashtags,
          descriptionText: descriptionText || null,
          descriptionHtml: null,
          packageContents: {
            text: descriptionSections.packageContentsText || null,
            status: descriptionSections.packageContentsText ? "collected" : "pending",
            source: descriptionSections.packageContentsText ? "dom:webDescription" : null,
            confidence: descriptionSections.packageContentsText ? 90 : 0,
          },
          richContent,
          rating,
          reviewCount,
          questionCount,
          availability: cleanText(ld?.offers?.availability) || null,
          price,
          package: packageData,
          attributes,
          variants,
          media: {
            images: imageUrls.map((url) => ({ url, kind: "gallery", source: "ozon" })),
            videoCovers: allVideoCovers.map((url) => ({ url, source: "ozon" })),
            videos: allVideos.map((url) => ({ url, source: "ozon" })),
            richContentImages: richContent.images.map((url) => ({ url, source: "ozon" })),
          },
        },
        evidence,
        conflicts,
        pendingFields: unique(pendingFields),
        quality: {
          structured: true,
          attributeCount: attributes.length,
          hashtagCount: hashtags.length,
          variantCount: variants.length,
          collectedVariantCount: variants.filter((variant) => variant.status === "collected").length,
          imageCount: imageUrls.length,
          videoCoverCount: allVideoCovers.length,
          videoCount: allVideos.length,
          conflictCount: conflicts.length,
          pendingCount: unique(pendingFields).length,
        },
        raw: {
          jsonLd: safeProductLd(ld),
          nuxt: {
            hierarchy: cleanText(readNuxtState()?.layoutTrackingInfo?.hierarchy) || null,
            pageInfo: readNuxtState()?.pageInfo || null,
          },
          nativeSections: {
            descriptionText: descriptionSections.descriptionText || null,
            packageContentsText: descriptionSections.packageContentsText || null,
            hashtags,
          },
          widgetNames: unique(
            [...document.querySelectorAll("[data-widget]")]
              .map((element) => element.getAttribute("data-widget"))
              .filter(Boolean),
          ).slice(0, 100),
        },
        h1: [title].filter(Boolean),
        priceText: price.observed.map((item) => item.raw),
        images: imageUrls,
        meta,
        textSample: pageText.slice(0, 12000),
      },
    };
  }

  globalThis.__OZON_AI_ERP_COLLECTOR__ = {
    name: "ozon-structured-product",
    version: COLLECTOR_VERSION,
    collect,
  };

  return {
    installed: true,
    name: "ozon-structured-product",
    version: COLLECTOR_VERSION,
  };
})();
