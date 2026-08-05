import { describe, expect, it } from 'vitest';
import { normalizeOzonPayload, ozonCanHandlePublicURL, ozonCollectorProvider } from '../index.js';

describe('OZON collector provider', () => {
  it('accepts OZON product pages only', () => {
    expect(ozonCanHandlePublicURL('https://www.ozon.ru/product/example-123/')).toBe(true);
    expect(ozonCanHandlePublicURL('https://www.ozon.ru/category/tools/')).toBe(false);
    expect(ozonCanHandlePublicURL('https://example.com/product/123')).toBe(false);
  });

  it('publishes the expected provider capabilities', () => {
    expect(ozonCollectorProvider.sourceId).toBe('ozon');
    expect(ozonCollectorProvider.meta.features).toEqual(
      expect.arrayContaining(['title', 'price', 'mainImages', 'descriptionImages', 'attributes', 'skus']),
    );
  });

  it('maps the structured page payload without inventing missing fields', () => {
    const product = normalizeOzonPayload(
      {
        data: {
          schemaVersion: 2,
          collector: 'test-fixture',
          product: {
            title: 'Test product',
            descriptionText: 'Description',
            price: { current: { currency: 'RUB', amount: 399 } },
            media: {
              images: [{ url: 'https://cdn.example/main.jpg' }],
              richContentImages: ['https://cdn.example/detail.jpg'],
            },
            attributes: [
              { name: 'Color', value: 'Red' },
              { name: 'Color', value: 'Blue' },
              { name: 'Color', value: 'Green' },
            ],
            variants: [{ sku: 'sku-1', options: [{ name: 'Color', value: 'Red' }] }],
          },
          pendingFields: ['package'],
        },
      },
      'https://www.ozon.ru/product/test-123/',
    );

    expect(product.title).toBe('Test product');
    expect(product.currency).toBe('RUB');
    expect(product.mainImages).toEqual(['https://cdn.example/main.jpg']);
    expect(product.descriptionImages).toEqual(['https://cdn.example/detail.jpg']);
    expect(product.attributes).toMatchObject({ Color: 'Red', 'Color (2)': 'Blue', 'Color (3)': 'Green' });
    expect(product.skus).toHaveLength(1);
    expect(product.raw).toMatchObject({ schemaVersion: 2, pendingFields: ['package'] });
  });

  it('rejects a payload with no product identity or media', () => {
    expect(() => normalizeOzonPayload({ data: { product: {} } }, 'https://www.ozon.ru/product/empty/')).toThrow(
      'PARSE_FAILED:ozon_title_and_images_missing',
    );
  });
});
