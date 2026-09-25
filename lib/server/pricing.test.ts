import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, minOrderShortfall, toPaise, fromPaise } from './pricing';
import type { Shop, CatalogItem } from '../types';

const mockShop: Shop = {
  id: 'shop-test',
  campus_id: 'campus-test',
  name: 'Test Canteen',
  slug: 'test-canteen',
  service_type: 'FOOD_DINING',
  image_url: '',
  description: '',
  is_open: true,
  is_snoozed: false,
  delivery_enabled: true,
  delivery_fee: 20,
  min_order_for_free_delivery: 150,
  min_order_amount: null,
  prep_time_minutes: 20,
  phone: '9999999999',
  rating: 4.8,
};

const mockItem: CatalogItem = {
  id: 'item-1',
  shop_id: 'shop-test',
  category_id: 'cat-1',
  name: 'Samosa',
  description: 'Crispy samosa',
  price: 20,
  image_url: '',
  is_veg: true,
  is_available: true,
};

describe('Pricing Engine', () => {
  it('converts between paise and rupees accurately without float drift', () => {
    assert.equal(toPaise(19.99), 1999);
    assert.equal(fromPaise(1999), 19.99);
    assert.equal(toPaise(0.1 + 0.2), 30);
  });

  it('charges delivery fee when below free delivery threshold', () => {
    // 2 x 20 = 40 itemsSubtotal. Threshold is 150. Delivery fee should be 20. Platform fee is 5.
    const result = priceCart([{ item: mockItem, quantity: 2 }], mockShop);
    assert.equal(result.itemsSubtotal, 40);
    assert.equal(result.deliveryFee, 20);
    assert.equal(result.platformFee, 5);
    assert.equal(result.total, 65);
    // Crucial check: minOrderShortfall must be null so small paid orders are NOT blocked!
    assert.equal(result.minOrderShortfall, null);
  });

  it('waives delivery fee when above free delivery threshold', () => {
    // 8 x 20 = 160 itemsSubtotal. Threshold is 150. Delivery fee should be 0. Platform fee is 5.
    const result = priceCart([{ item: mockItem, quantity: 8 }], mockShop);
    assert.equal(result.itemsSubtotal, 160);
    assert.equal(result.deliveryFee, 0);
    assert.equal(result.platformFee, 5);
    assert.equal(result.total, 165);
    assert.equal(result.minOrderShortfall, null);
  });

  it('enforces min_order_amount only when explicitly set on shop', () => {
    const shopWithMin: Shop = { ...mockShop, min_order_amount: 100 };
    const shortfall = minOrderShortfall(shopWithMin, 40);
    assert.equal(shortfall, 60);

    const satisfied = minOrderShortfall(shopWithMin, 120);
    assert.equal(satisfied, null);
  });
});
