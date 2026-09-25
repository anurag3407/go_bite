'use client';

// lib/store/cart-context.tsx
// Server-backed cart and order state.
//
// The old version held the cart, the bill and the order state machine in React
// state, which meant prices could be edited in devtools, the total was recomputed
// client-side, and everything vanished on refresh. Every mutation here is now an
// API call and every number shown comes from the server.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiClientError, api, errorMessage, newIdempotencyKey } from '@/lib/api-client';
import { useSession } from '@/lib/store/session-context';
import type { CartIssue, CartView, CatalogItem, Order, PaymentMethod, Shop } from '@/lib/types';

/** How often open orders are re-fetched when live updates are unavailable. */
const ORDER_POLL_MS = 15_000;

interface CartContextType {
  cart: CartView | null;
  isLoadingCart: boolean;
  cartError: string | null;
  itemsCount: number;

  addItem: (item: CatalogItem, shop: Shop) => Promise<void>;
  updateQuantity: (itemId: string, delta: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;

  /** Item that must replace the current cart (different merchant). */
  pendingConflict: { item: CatalogItem; shop: Shop } | null;
  confirmReplaceCart: () => Promise<void>;
  cancelReplaceCart: () => void;

  // Checkout inputs
  selectedLocationId: string | null;
  setSelectedLocationId: React.Dispatch<React.SetStateAction<string | null>>;
  roomOrFlat: string;
  setRoomOrFlat: (value: string) => void;
  specialInstructions: string;
  setSpecialInstructions: (value: string) => void;

  issues: CartIssue[];
  validateCart: () => Promise<CartIssue[]>;
  isPlacing: boolean;
  placeOrder: (paymentMethod: PaymentMethod) => Promise<Order>;

  // Orders
  orders: Order[];
  isLoadingOrders: boolean;
  refreshOrders: () => Promise<void>;
  cancelOrder: (orderId: string, reason: string) => Promise<void>;
  disputeOrder: (orderId: string, note: string) => Promise<void>;
  activeTrackingOrder: Order | null;
  setActiveTrackingOrder: (order: Order | null) => void;

  // Cart drawer
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, openAuthModal } = useSession();

  const [cart, setCart] = useState<CartView | null>(null);
  const [isLoadingCart, setIsLoadingCart] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<{ item: CatalogItem; shop: Shop } | null>(null);
  const [issues, setIssues] = useState<CartIssue[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [roomOrFlat, setRoomOrFlat] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [activeTrackingOrder, setActiveTrackingOrder] = useState<Order | null>(null);

  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);

  // Keeps one idempotency key per checkout attempt, so a retry after a network
  // timeout cannot create a second order. Cleared only on success.
  const idempotencyKeyRef = useRef<string | null>(null);

  const itemsCount = useMemo(
    () => (cart?.items ?? []).reduce((sum, line) => sum + line.quantity, 0),
    [cart],
  );

  const refreshCart = useCallback(async () => {
    if (!user) {
      setCart(null);
      setIssues([]);
      return;
    }
    setIsLoadingCart(true);
    try {
      const data = await api.get<{ cart: CartView | null; campusRequired?: boolean }>('/api/v1/cart');
      setCart(data.cart);
      setCartError(data.campusRequired ? 'Choose your campus to start ordering.' : null);
    } catch (error) {
      setCartError(errorMessage(error));
    } finally {
      setIsLoadingCart(false);
    }
  }, [user]);

  const refreshOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setActiveTrackingOrder(null);
      return;
    }
    setIsLoadingOrders(true);
    try {
      const data = await api.get<{ orders: Order[] }>('/api/v1/orders');
      setOrders(data.orders);
      setActiveTrackingOrder((current) => {
        if (!current) return current;
        // Keep the tracked order in sync with the newest server state.
        return data.orders.find((order) => order.id === current.id) ?? current;
      });
    } catch (error) {
      setCartError(errorMessage(error));
    } finally {
      setIsLoadingOrders(false);
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(async () => {
      if (isMounted) await refreshCart();
    });
    return () => {
      isMounted = false;
    };
  }, [refreshCart]);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(async () => {
      if (isMounted) await refreshOrders();
    });
    return () => {
      isMounted = false;
    };
  }, [refreshOrders]);

  // Poll while anything is live. This is the documented fallback when the
  // realtime transport (SSE) is unavailable (plan.md §11.1).
  const hasLiveOrders = orders.some(
    (order) => order.status !== 'DELIVERED' && order.status !== 'CANCELLED',
  );

  useEffect(() => {
    if (!user || !hasLiveOrders) return;
    const timer = setInterval(() => void refreshOrders(), ORDER_POLL_MS);
    return () => clearInterval(timer);
  }, [user, hasLiveOrders, refreshOrders]);

  const mutateCart = useCallback(
    async (request: () => Promise<{ cart: CartView | null }>, onConflict?: () => void) => {
      try {
        const data = await request();
        setCart(data.cart);
        setIssues([]);
        setCartError(null);
        return true;
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'CART_CONFLICT_SINGLE_SHOP') {
          onConflict?.();
          return false;
        }
        setCartError(errorMessage(error));
        return false;
      }
    },
    [],
  );

  const addItem = useCallback(
    async (item: CatalogItem, shop: Shop) => {
      if (!user) {
        openAuthModal('Sign in to add items and place your order.');
        return;
      }

      const existing = cart?.items.find((line) => line.item.id === item.id);
      const nextQuantity = (existing?.quantity ?? 0) + 1;

      await mutateCart(
        () =>
          api.put<{ cart: CartView | null }>('/api/v1/cart/items', {
            shopId: shop.id,
            itemId: item.id,
            quantity: nextQuantity,
          }),
        () => setPendingConflict({ item, shop }),
      );
    },
    [user, cart, mutateCart, openAuthModal],
  );

  const updateQuantity = useCallback(
    async (itemId: string, delta: number) => {
      if (!user || !cart) return;
      const line = cart.items.find((entry) => entry.item.id === itemId);
      const nextQuantity = Math.max((line?.quantity ?? 0) + delta, 0);

      if (nextQuantity === 0) {
        await mutateCart(() =>
          api.delete<{ cart: CartView | null }>(`/api/v1/cart/items/${encodeURIComponent(itemId)}`),
        );
        return;
      }

      await mutateCart(() =>
        api.put<{ cart: CartView | null }>('/api/v1/cart/items', {
          shopId: cart.shopId,
          itemId,
          quantity: nextQuantity,
        }),
      );
    },
    [user, cart, mutateCart],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      await mutateCart(() =>
        api.delete<{ cart: CartView | null }>(`/api/v1/cart/items/${encodeURIComponent(itemId)}`),
      );
    },
    [mutateCart],
  );

  const clearCart = useCallback(async () => {
    await mutateCart(() => api.delete<{ cart: CartView | null }>('/api/v1/cart'));
  }, [mutateCart]);

  /** Confirmed replacement of a cart belonging to another merchant. */
  const confirmReplaceCart = useCallback(async () => {
    const conflict = pendingConflict;
    if (!conflict) return;
    setPendingConflict(null);

    await mutateCart(() =>
      api.put<{ cart: CartView | null }>('/api/v1/cart/items', {
        shopId: conflict.shop.id,
        itemId: conflict.item.id,
        quantity: 1,
      }),
    );
  }, [pendingConflict, mutateCart]);

  const cancelReplaceCart = useCallback(() => setPendingConflict(null), []);

  const validateCart = useCallback(async (): Promise<CartIssue[]> => {
    try {
      const data = await api.post<{ issues: CartIssue[]; cart: CartView | null }>(
        '/api/v1/cart/validate',
      );
      setIssues(data.issues);
      if (data.cart) setCart(data.cart);
      return data.issues;
    } catch (error) {
      const issue: CartIssue[] = [{ code: 'CART_EMPTY', message: errorMessage(error) }];
      setIssues(issue);
      return issue;
    }
  }, []);

  const placeOrder = useCallback(
    async (paymentMethod: PaymentMethod): Promise<Order> => {
      if (!user) {
        openAuthModal('Sign in to place your order.');
        throw new ApiClientError('UNAUTHORIZED', 'Sign in to place your order.', 401);
      }
      if (!selectedLocationId) {
        throw new ApiClientError('VALIDATION_ERROR', 'Choose where the order should be delivered.', 400);
      }

      setIsPlacing(true);
      try {
        // Re-validate server-side before the write, so "sold out" and "closed"
        // are caught with a clear message rather than a failed placement.
        const found = await validateCart();
        const blocking = found.filter((issue) => issue.code !== 'CART_EMPTY');
        if (blocking.length > 0) {
          throw new ApiClientError(blocking[0].code, blocking[0].message, 409);
        }

        if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();

        const data = await api.post<{ order: Order }>(
          '/api/v1/orders',
          {
            campusLocationId: selectedLocationId,
            roomOrFlat: roomOrFlat.trim(),
            paymentMethod,
            specialInstructions: specialInstructions.trim() || undefined,
          },
          { idempotencyKey: idempotencyKeyRef.current },
        );

        idempotencyKeyRef.current = null;
        setOrders((current) => [data.order, ...current]);
        setActiveTrackingOrder(data.order);
        setSpecialInstructions('');
        setCart(null);
        setIsCartDrawerOpen(false);
        return data.order;
      } finally {
        setIsPlacing(false);
      }
    },
    [user, openAuthModal, selectedLocationId, roomOrFlat, specialInstructions, validateCart],
  );

  const cancelOrder = useCallback(
    async (orderId: string, reason: string) => {
      const data = await api.post<{ order: Order }>(`/api/v1/orders/${orderId}/actions`, {
        action: 'cancel',
        reason,
      });
      setOrders((current) => current.map((order) => (order.id === orderId ? data.order : order)));
      setActiveTrackingOrder((current) => (current?.id === orderId ? data.order : current));
    },
    [],
  );

  const disputeOrder = useCallback(async (orderId: string, note: string) => {
    const data = await api.post<{ order: Order }>(`/api/v1/orders/${orderId}/actions`, {
      action: 'dispute',
      note,
    });
    setOrders((current) => current.map((order) => (order.id === orderId ? data.order : order)));
    setActiveTrackingOrder((current) => (current?.id === orderId ? data.order : current));
  }, []);

  const value = useMemo<CartContextType>(
    () => ({
      cart,
      isLoadingCart,
      cartError,
      itemsCount,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      refreshCart,
      pendingConflict,
      confirmReplaceCart,
      cancelReplaceCart,
      selectedLocationId,
      setSelectedLocationId,
      roomOrFlat,
      setRoomOrFlat,
      specialInstructions,
      setSpecialInstructions,
      issues,
      validateCart,
      isPlacing,
      placeOrder,
      orders,
      isLoadingOrders,
      refreshOrders,
      cancelOrder,
      disputeOrder,
      activeTrackingOrder,
      setActiveTrackingOrder,
      isCartDrawerOpen,
      setIsCartDrawerOpen,
    }),
    [
      cart,
      isLoadingCart,
      cartError,
      itemsCount,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      refreshCart,
      pendingConflict,
      confirmReplaceCart,
      cancelReplaceCart,
      selectedLocationId,
      roomOrFlat,
      specialInstructions,
      issues,
      validateCart,
      isPlacing,
      placeOrder,
      orders,
      isLoadingOrders,
      refreshOrders,
      cancelOrder,
      disputeOrder,
      activeTrackingOrder,
      isCartDrawerOpen,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}
