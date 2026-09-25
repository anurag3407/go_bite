import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from './store/memory';
import type { CreateOrderInput } from './store/types';

describe('COD Settlement & Dues Accounting', () => {
  it('correctly aggregates delivered COD orders and isolates refunds and uncaptured disputes', async () => {
    const store = new MemoryStore();
    const campusId = 'campus-test';
    const shopId = 'shop-1';

    const baseOrder: CreateOrderInput = {
      id: 'ord-1',
      order_number: 'GB-IIT-000001',
      campus_id: campusId,
      shop_id: shopId,
      customer_id: 'cust-1',
      address_id: null,
      address_summary: 'Hall 3, Room 101',
      idempotency_key: 'idem-test-1',
      status: 'DELIVERED',
      delivery_pin: '1234',
      items_subtotal: 100,
      delivery_fee: 20,
      platform_fee: 5,
      tax_fee: 0,
      total_amount: 125,
      items: [
        {
          catalog_item_id: 'item-1',
          item_name: 'Biryani',
          unit_price: 100,
          quantity: 1,
          total_price: 100,
        },
      ],
      payment: {
        payment_method: 'CASH_ON_DELIVERY',
        status: 'CAPTURED',
        amount: 125,
      },
    };

    // 1. Order 1: Delivered & Captured (₹125 COD, ₹5 platform fee)
    await store.createOrder(baseOrder);

    // 2. Order 2: Disputed from OUT_FOR_DELIVERY with payment still PENDING (must NOT be counted in COD collected!)
    await store.createOrder({
      ...baseOrder,
      id: 'ord-2',
      order_number: 'GB-IIT-000002',
      status: 'DISPUTED',
      total_amount: 200,
      platform_fee: 5,
      payment: {
        payment_method: 'CASH_ON_DELIVERY',
        status: 'PENDING',
        amount: 200,
      },
    });

    // 3. Order 3: Cancelled / Refunded after delivery (₹150 COD refunded)
    await store.createOrder({
      ...baseOrder,
      id: 'ord-3',
      order_number: 'GB-IIT-000003',
      status: 'CANCELLED',
      total_amount: 150,
      platform_fee: 5,
      payment: {
        payment_method: 'CASH_ON_DELIVERY',
        status: 'REFUNDED',
        amount: 150,
      },
    });

    const dues = await store.duesByCampus(campusId);
    assert.equal(dues.length, 1);
    const shopDues = dues[0];

    // Assertions
    assert.equal(shopDues.deliveredOrders, 1);
    assert.equal(shopDues.codCollected, 125);
    assert.equal(shopDues.platformFeesOwed, 5);
    assert.equal(shopDues.grossVolume, 125);
    assert.equal(shopDues.refundedOrders, 1);
    assert.equal(shopDues.refundedAmount, 150);
  });
});
