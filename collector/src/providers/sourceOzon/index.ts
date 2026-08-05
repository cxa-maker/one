import { readFileSync } from 'node:fs';
import type { Page } from 'playwright';
import type { BrowserManager } from '../../browser/manager.js';
import { getDefaultNavigationTimeoutMs } from '../../config/env.js';
import type { CollectInput, CollectorProvider } from '../collector-provider.js';
import type { CollectFeature } from '../../types/provider-meta.js';
import type { NormalizedProduct } from '../../types/product.js';

const OZON_PAGE_COLLECTOR = readFileSync(new URL('./ozon-product.js', import.meta.url), 'utf8');

function isOzonHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === 'ozon.ru' || value.endsWith('.ozon.ru') || value === 'ozon.cn' || value.endsWith('.ozon.cn');
}

export function ozonCanHandlePublicURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      isOzonHostname(parsed.hostname) &&
      /\/product\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function numberValue(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function objectAttributes(items: unknown): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!Array.isArray(items)) return result;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { name?: unknown; value?: unknown };
    const name = stringValue(row.name);
    const value = row.value;
    if (!name || value === null || value === undefined || value === '') continue;
    let key = name;
    let duplicate = 1;
    while (Object.prototype.hasOwnProperty.call(result, key)) {
      duplicate += 1;
      key = `${name} (${duplicate})`;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      result[key] = value;
    } else {
      result[key] = stringValue(value);
    }
  }
  return result;
}

function normalizeVariants(variants: unknown): NormalizedProduct['skus'] {
  if (!Array.isArray(variants)) return [];
  return variants.map((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const options: Record<string, string> = {};
    if (Array.isArray(row.options)) {
      for (const option of row.options) {
        if (!option || typeof option !== 'object') continue;
        const pair = option as { name?: unknown; value?: unknown };
        const name = stringValue(pair.name);
        const value = stringValue(pair.value);
        if (name && value) options[name] = value;
      }
    }
    const price = row.price && typeof row.price === 'object' ? (row.price as Record<string, unknown>) : {};
    const images = Array.isArray(row.images) ? row.images.map(stringValue).filter(Boolean) : [];
    return {
      id: stringValue(row.sku) || undefined,
      skuCode: stringValue(row.sku) || undefined,
      properties: options,
      price: numberValue(price.amount),
      image: images[0] || undefined,
      raw: row,
    };
  });
}

export function normalizeOzonPayload(payload: Record<string, unknown>, sourceUrl: string): NormalizedProduct {
  const data = recordValue(payload.data);
  const product = recordValue(data.product);
  const title = stringValue(product.title);
  const media = recordValue(product.media);
  const images = Array.isArray(media.images)
    ? media.images
        .map((item) => (item && typeof item === 'object' ? stringValue(recordValue(item).url) : stringValue(item)))
        .filter(Boolean)
    : [];
  const descriptionImages = Array.isArray(media.richContentImages)
    ? media.richContentImages
        .map((item) => (item && typeof item === 'object' ? stringValue(recordValue(item).url) : stringValue(item)))
        .filter(Boolean)
    : [];
  const price = recordValue(product.price);
  const currentPrice = recordValue(price.current);
  const structuredPrice = recordValue(price.structured);

  if (!title && images.length === 0) {
    throw new Error('PARSE_FAILED:ozon_title_and_images_missing');
  }

  return {
    source: 'ozon',
    sourceUrl,
    title,
    currency: stringValue(currentPrice.currency || structuredPrice.currency),
    mainDescription: stringValue(product.descriptionText),
    mainImages: images,
    descriptionImages,
    attributes: objectAttributes(product.attributes),
    skus: normalizeVariants(product.variants),
    raw: {
      schemaVersion: data.schemaVersion ?? 2,
      collector: data.collector ?? null,
      product,
      evidence: data.evidence ?? [],
      conflicts: data.conflicts ?? [],
      pendingFields: data.pendingFields ?? [],
      quality: data.quality ?? null,
      pagePayload: payload,
    },
  };
}

async function installAndCollect(page: Page, deepVariants: boolean): Promise<Record<string, unknown>> {
  await page.addScriptTag({ content: OZON_PAGE_COLLECTOR });
  const payload = await page.evaluate(async (collectDeepVariants) => {
    const collector = (globalThis as typeof globalThis & {
      __OZON_AI_ERP_COLLECTOR__?: { collect?: (options?: Record<string, unknown>) => Promise<unknown> };
    }).__OZON_AI_ERP_COLLECTOR__;
    if (!collector?.collect) throw new Error('OZON_COLLECTOR_NOT_INSTALLED');
    return collector.collect({ deepVariants: collectDeepVariants });
  }, deepVariants);

  if (!payload || typeof payload !== 'object') throw new Error('PARSE_FAILED:ozon_payload_empty');
  return payload as Record<string, unknown>;
}

async function collectOnPage(page: Page, sourceUrl: string, deepVariants: boolean): Promise<NormalizedProduct> {
  const timeout = getDefaultNavigationTimeoutMs();
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`NAVIGATION_FAILED:${message}`);
  }
  await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 12_000) }).catch(() => undefined);
  await page.waitForTimeout(700);

  const payload = await installAndCollect(page, deepVariants);
  return normalizeOzonPayload(payload, sourceUrl);
}

export const ozonCollectorProvider: CollectorProvider = {
  sourceId: 'ozon',
  meta: {
    name: 'OZON 商品采集器',
    description: '采集 OZON 商品页的标题、竞品售价、属性、变体、主图、详情图、视频和来源证据。',
    status: 'beta',
    batchSupported: false,
    urlPatterns: ['https://www.ozon.ru/product/*'],
    features: ['title', 'price', 'mainImages', 'descriptionImages', 'attributes', 'skus'] satisfies CollectFeature[],
    notes: '当前只读采集，不写入 OZON；登录、风控或页面改版可能导致字段进入 pending。',
  },
  canHandle(url: string): boolean {
    return ozonCanHandlePublicURL(url);
  },
  async collect(browser: BrowserManager, input: CollectInput): Promise<NormalizedProduct> {
    const sourceUrl = input.url.trim();
    if (!ozonCanHandlePublicURL(sourceUrl)) throw new Error('INVALID_URL:not_an_ozon_product_url');
    const deepVariants = input.options?.deepVariants !== false;
    const profileKey = stringValue(input.options?.profileKey);
    const run = (page: Page) => collectOnPage(page, sourceUrl, deepVariants);
    return profileKey ? browser.withCustomProfilePage(profileKey, run) : browser.withPage(run);
  },
};
