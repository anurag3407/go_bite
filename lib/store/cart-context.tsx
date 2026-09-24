'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { CatalogItem, CartItem, Order, CustomerAddress, Shop } from '@/lib/types';
import { MOCK_SHOPS, MOCK_ACTIVE_ORDERS, MOCK_CAMPUS_LOCATIONS } from '@/lib/mock-data';

interface CartContextType {
  cartShopId: string | null;
  cartShop: Shop | null;
  items: CartItem[];
  addItem: (item: CatalogItem, shop: Shop) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, delta: number) => void;
  clearCart: () => void;
  itemsCount: number;
  subtotal: number;
  deliveryFee: number;
  platformFee: number;
  total: number;
  
  // Checkout & Addresses
  selectedAddress: CustomerAddress;
  setSelectedAddress: (addr: CustomerAddress) => void;
  specialInstructions: string;
  setSpecialInstructions: (instructions: string) => void;
  
  // Orders & State Machine
  orders: Order[];
  placeOrder: (paymentMethod: 'UPI_INTENT' | 'CASH_ON_DELIVERY') => Order;
  cancelOrder: (orderId: string, reason: string) => boolean;
  updateOrderStatus: (orderId: string, nextStatus: Order['status']) => void;
  verifyDeliveryPin: (orderId: string, pin: string) => { success: boolean; message: string };
  
  // UI Drawers & Tracking Modals
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
  activeTrackingOrder: Order | null;
  setActiveTrackingOrder: (order: Order | null) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const DEFAULT_ADDRESS: CustomerAddress = {
  id: 'addr-default',
  user_id: 'user-student-1',
  campus_location_id: 'loc-1',
  location_name: 'Aryabhatta Hostel (Boys Hostel Block A)',
  room_or_flat: 'Room 312',
  landmark: 'Opposite Basketball Court',
  alternate_phone: '9876543299',
  is_default: true,
};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartShopId, setCartShopId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>(MOCK_ACTIVE_ORDERS);
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddress>(DEFAULT_ADDRESS);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [activeTrackingOrder, setActiveTrackingOrder] = useState<Order | null>(MOCK_ACTIVE_ORDERS[0]);

  // Find shop matching cart
  const cartShop = cartShopId ? MOCK_SHOPS.find((s) => s.id === cartShopId) || null : null;

  // Add Item to Cart
  const addItem = (item: CatalogItem, shop: Shop) => {
    if (cartShopId && cartShopId !== shop.id) {
      const confirmClear = window.confirm(
        `Your cart contains items from ${cartShop?.name}. Clear cart to add items from ${shop.name}?`
      );
      if (!confirmClear) return;
      setItems([{ item, quantity: 1 }]);
      setCartShopId(shop.id);
      return;
    }

    setCartShopId(shop.id);
    setItems((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id);
      if (existing) {
        return prev.map((ci) =>
          ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const removeItem = (itemId: string) => {
    setItems((prev) => {
      const next = prev.filter((ci) => ci.item.id !== itemId);
      if (next.length === 0) setCartShopId(null);
      return next;
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setItems((prev) => {
      return prev
        .map((ci) => {
          if (ci.item.id === itemId) {
            const newQty = ci.quantity + delta;
            return newQty > 0 ? { ...ci, quantity: newQty } : null;
          }
          return ci;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const clearCart = () => {
    setItems([]);
    setCartShopId(null);
  };

  const itemsCount = items.reduce((sum, ci) => sum + ci.quantity, 0);
  const subtotal = items.reduce((sum, ci) => {
    const price = ci.item.discounted_price ?? ci.item.price;
    return sum + price * ci.quantity;
  }, 0);

  // Delivery fee logic: Free if above threshold, else shop's delivery fee
  let deliveryFee = cartShop ? cartShop.delivery_fee : 0;
  if (cartShop?.min_order_for_free_delivery && subtotal >= cartShop.min_order_for_free_delivery) {
    deliveryFee = 0;
  }
  const platformFee = items.length > 0 ? 5 : 0; // standard ₹5 campus platform convenience
  const total = subtotal + deliveryFee + platformFee;

  // Place Order
  const placeOrder = (paymentMethod: 'UPI_INTENT' | 'CASH_ON_DELIVERY'): Order => {
    if (!cartShop || items.length === 0) {
      throw new Error('Cart is empty');
    }

    // Generate random 4-digit unguessable Delivery PIN
    const deliveryPin = Math.floor(1000 + Math.random() * 9000).toString();
    const orderNumber = `GB-${cartShop.slug.slice(0, 3).toUpperCase()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      order_number: orderNumber,
      campus_id: cartShop.campus_id,
      campus_name: 'IIT Patna (Bihta)',
      shop_id: cartShop.id,
      shop_name: cartShop.name,
      customer_id: 'user-student-1',
      customer_name: 'Anurag Mishra',
      customer_phone: '9876543299',
      address_summary: `${selectedAddress.location_name}, ${selectedAddress.room_or_flat}`,
      status: 'PLACED',
      delivery_pin: deliveryPin,
      items_subtotal: subtotal,
      delivery_fee: deliveryFee,
      platform_fee: platformFee,
      tax_fee: 0,
      total_amount: total,
      special_instructions: specialInstructions,
      estimated_delivery_time: `${cartShop.prep_time_minutes + 10} mins`,
      created_at: new Date().toISOString(),
      items: items.map((ci, idx) => ({
        id: `oi-${Date.now()}-${idx}`,
        order_id: `ord-${Date.now()}`,
        catalog_item_id: ci.item.id,
        item_name: ci.item.name,
        unit_price: ci.item.discounted_price ?? ci.item.price,
        quantity: ci.quantity,
        total_price: (ci.item.discounted_price ?? ci.item.price) * ci.quantity,
      })),
      payment: {
        id: `pay-${Date.now()}`,
        order_id: `ord-${Date.now()}`,
        payment_method: paymentMethod,
        status: paymentMethod === 'UPI_INTENT' ? 'CAPTURED' : 'PENDING',
        amount: total,
        created_at: new Date().toISOString(),
      },
    };

    setOrders((prev) => [newOrder, ...prev]);
    setActiveTrackingOrder(newOrder);
    clearCart();
    setIsCartDrawerOpen(false);
    return newOrder;
  };

  const cancelOrder = (orderId: string, reason: string): boolean => {
    let success = false;
    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId && ord.status === 'PLACED') {
          success = true;
          return {
            ...ord,
            status: 'CANCELLED',
            cancelled_at: new Date().toISOString(),
            cancellation_reason: reason,
          };
        }
        return ord;
      })
    );
    return success;
  };

  const updateOrderStatus = (orderId: string, nextStatus: Order['status']) => {
    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          const updated = {
            ...ord,
            status: nextStatus,
            delivered_at: nextStatus === 'DELIVERED' ? new Date().toISOString() : ord.delivered_at,
          };
          if (activeTrackingOrder?.id === orderId) {
            setActiveTrackingOrder(updated);
          }
          return updated;
        }
        return ord;
      })
    );
  };

  // Verify delivery pin entered by shop delivery boy
  const verifyDeliveryPin = (orderId: string, inputPin: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return { success: false, message: 'Order not found' };
    if (order.status === 'DELIVERED') return { success: false, message: 'Order already delivered' };
    if (order.delivery_pin !== inputPin.trim()) {
      return { success: false, message: 'Incorrect Delivery PIN! Please ask the student for their 4-digit code.' };
    }

    // PIN matched!
    updateOrderStatus(orderId, 'DELIVERED');
    return { success: true, message: 'Delivery PIN verified! Order completed successfully.' };
  };

  return (
    <CartContext.Provider
      value={{
        cartShopId,
        cartShop,
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        itemsCount,
        subtotal,
        deliveryFee,
        platformFee,
        total,
        selectedAddress,
        setSelectedAddress,
        specialInstructions,
        setSpecialInstructions,
        orders,
        placeOrder,
        cancelOrder,
        updateOrderStatus,
        verifyDeliveryPin,
        isCartDrawerOpen,
        setIsCartDrawerOpen,
        activeTrackingOrder,
        setActiveTrackingOrder,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
