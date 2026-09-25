-- Go-Bite Seed Data Migration for Supabase / PostgreSQL
-- Populates initial campuses, locations, shops, categories, menu items, and privileged staff roles.
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING).

-- 1. Campuses
INSERT INTO campuses (id, name, slug, code, center_lat, center_lng, radius_meters, is_active)
VALUES
  ('c1111111-1111-1111-1111-111111111111', 'IIT Patna (Bihta Campus)', 'iit-patna-bihta', 'IITP-BIHTA', 25.53570000, 84.85120000, 4500, true),
  ('c2222222-2222-2222-2222-222222222222', 'IIT Kanpur', 'iit-kanpur', 'IITK', 26.51230000, 80.23290000, 5000, true),
  ('c3333333-3333-3333-3333-333333333333', 'NIT Patna', 'nit-patna', 'NITP', 25.62070000, 85.17240000, 3000, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Campus Drop Locations (IIT Patna)
INSERT INTO campus_locations (id, campus_id, name, type, delivery_allowed_at_door)
VALUES
  ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'Aryabhatta Hostel (Boys Hostel Block A)', 'BOYS_HOSTEL', false),
  ('b2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 'Chanakya Hostel (Boys Hostel Block B)', 'BOYS_HOSTEL', false),
  ('b3333333-3333-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111', 'Gargi Hostel (Girls Hostel)', 'GIRLS_HOSTEL', false),
  ('b4444444-4444-4444-4444-444444444444', 'c1111111-1111-1111-1111-111111111111', 'Central Library Courtyard', 'LIBRARY', true),
  ('b5555555-5555-5555-5555-555555555555', 'c1111111-1111-1111-1111-111111111111', 'Academic Complex / Block 3', 'ACADEMIC_BLOCK', true),
  ('b6666666-6666-6666-6666-666666666666', 'c1111111-1111-1111-1111-111111111111', 'Main Campus Security Gate 1', 'CAMPUS_GATE', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Merchants / Shops
INSERT INTO shops (id, campus_id, name, slug, service_type, image_url, description, is_open, is_snoozed, delivery_enabled, delivery_fee, min_order_for_free_delivery, prep_time_minutes, upi_vpa, phone, rating, tags, banner_text)
VALUES
  (
    'd1111111-1111-1111-1111-111111111111',
    'c1111111-1111-1111-1111-111111111111',
    'YumQuick Night Canteen',
    'yumquick-night-canteen',
    'FOOD_DINING',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=500&q=80',
    'Hot meals, shakes, burgers & late-night munchies delivered directly to hostel gates.',
    true, false, true, 10.00, 150.00, 20, 'yumquick@upi', '9876543210', 4.8,
    ARRAY['Burgers', 'Shakes', 'Night Mess', 'Pasta'],
    'Open till 3:00 AM • Free Delivery above ₹150'
  ),
  (
    'd2222222-2222-2222-2222-222222222222',
    'c1111111-1111-1111-1111-111111111111',
    'Nescafe & Juice Kiosk',
    'nescafe-juice-kiosk',
    'FOOD_DINING',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=500&q=80',
    'Cold coffee, iced teas, fresh fruit juices, and instant grilled sandwiches.',
    true, false, true, 10.00, 100.00, 15, 'nescafekiosk@upi', '9876543211', 4.6,
    ARRAY['Cold Coffee', 'Sandwiches', 'Juices', 'Tea'],
    'Fresh Sandwiches & Beverages'
  ),
  (
    'd3333333-3333-3333-3333-333333333333',
    'c1111111-1111-1111-1111-111111111111',
    'Campus Kathi Rolls & Biryani',
    'campus-kathi-rolls',
    'FOOD_DINING',
    'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=500&q=80',
    'Crispy egg, paneer, and chicken rolls prepared fresh with mint chutney.',
    true, false, true, 15.00, 200.00, 25, 'campusrolls@upi', '9876543212', 4.7,
    ARRAY['Kathi Rolls', 'Biryani', 'Chaat'],
    'Student Special Combo: Roll + Drink at ₹119'
  ),
  (
    'd4444444-4444-4444-4444-444444444444',
    'c1111111-1111-1111-1111-111111111111',
    'Urban Campus Salon & Grooming',
    'urban-campus-salon',
    'SALON_GROOMING',
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=500&q=80',
    'Student haircut, beard styling, head massage, and facial appointments at student center.',
    true, false, false, 0.00, NULL, 30, 'campussalon@upi', '9876543213', 4.9,
    ARRAY['Haircut', 'Beard Trim', 'Head Massage', 'Facial'],
    'Pre-book slots without waiting in hostel lines'
  ),
  (
    'd5555555-5555-5555-5555-555555555555',
    'c1111111-1111-1111-1111-111111111111',
    'Sparkle Campus Laundry',
    'sparkle-campus-laundry',
    'LAUNDRY',
    'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=500&q=80',
    'Hostel doorstep bag pickup, wash, steam iron, and folded return within 24 hours.',
    true, false, true, 15.00, NULL, 60, 'sparklelaundry@upi', '9876543214', 4.5,
    ARRAY['Wash & Iron', 'Dry Clean', 'Doorstep Pickup'],
    'Per kg wash & iron with hostel delivery'
  ),
  (
    'd6666666-6666-6666-6666-666666666666',
    'c1111111-1111-1111-1111-111111111111',
    'Speedy Printouts & Stationery',
    'speedy-printouts',
    'PRINT_STATIONERY',
    'https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?auto=format&fit=crop&w=500&q=80',
    'Upload PDF lab manuals, thesis, or notes and get bound printouts delivered before class.',
    true, false, true, 10.00, NULL, 15, 'speedyprint@upi', '9876543215', 4.8,
    ARRAY['Color Print', 'Spiral Binding', 'Lab Reports', 'Stationery'],
    'Instant PDF printout delivery to Hostel Gate'
  )
ON CONFLICT (id) DO NOTHING;

-- 4. Catalog Categories
INSERT INTO catalog_categories (id, shop_id, name, display_order)
VALUES
  ('e1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'Snacks & Starters', 1),
  ('e2222222-2222-2222-2222-222222222222', 'd1111111-1111-1111-1111-111111111111', 'Main Meals', 2),
  ('e3333333-3333-3333-3333-333333333333', 'd1111111-1111-1111-1111-111111111111', 'Shakes & Drinks', 3),
  ('e4444444-4444-4444-4444-444444444444', 'd1111111-1111-1111-1111-111111111111', 'Desserts', 4)
ON CONFLICT (id) DO NOTHING;

-- 5. Catalog Items (YumQuick Menu)
INSERT INTO catalog_items (id, shop_id, category_id, name, description, price, discounted_price, image_url, is_veg, is_available)
VALUES
  (
    'f1111111-1111-1111-1111-111111111111',
    'd1111111-1111-1111-1111-111111111111',
    'e3333333-3333-3333-3333-333333333333',
    'Strawberry Shake',
    'Fresh strawberry blend with vanilla ice cream and whipped topping.',
    120.00, 99.00,
    'https://images.unsplash.com/photo-1553787499-6f9133860278?auto=format&fit=crop&w=400&q=80',
    true, true
  ),
  (
    'f2222222-2222-2222-2222-222222222222',
    'd1111111-1111-1111-1111-111111111111',
    'e2222222-2222-2222-2222-222222222222',
    'Broccoli Lasagna',
    'Baked layers of pasta, tender broccoli florets, creamy bechamel, and melted mozzarella.',
    180.00, 159.00,
    'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?auto=format&fit=crop&w=400&q=80',
    true, true
  ),
  (
    'f3333333-3333-3333-3333-333333333333',
    'd1111111-1111-1111-1111-111111111111',
    'e1111111-1111-1111-1111-111111111111',
    'Crispy Chicken Burger',
    'Golden fried chicken patty with iceberg lettuce, secret spicy mayo, and pickles.',
    140.00, 129.00,
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
    false, true
  ),
  (
    'f4444444-4444-4444-4444-444444444444',
    'd1111111-1111-1111-1111-111111111111',
    'e2222222-2222-2222-2222-222222222222',
    'Chicken Curry with Steamed Rice',
    'Homestyle spicy chicken curry served with fragrant basmati rice and pickle.',
    210.00, NULL,
    'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=400&q=80',
    false, true
  ),
  (
    'f5555555-5555-5555-5555-555555555555',
    'd1111111-1111-1111-1111-111111111111',
    'e1111111-1111-1111-1111-111111111111',
    'Bean & Veggie Burger',
    'Spiced kidney bean patty, fresh tomato, cucumber slices, and mint yoghurt spread.',
    110.00, 89.00,
    'https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=400&q=80',
    true, true
  ),
  (
    'f6666666-6666-6666-6666-666666666666',
    'd1111111-1111-1111-1111-111111111111',
    'e4444444-4444-4444-4444-444444444444',
    'Strawberry Cheesecake',
    'New York style cheesecake slice topped with sweet strawberry compote.',
    150.00, NULL,
    'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=400&q=80',
    true, true
  )
ON CONFLICT (id) DO NOTHING;

-- 6. Initial System Users (Student, Merchant, Admin, Resolver)
INSERT INTO users (id, name, email, phone, phone_verified, role, active_campus_id, shop_id, is_active)
VALUES
  ('user-student-1', 'Anurag Mishra', 'anurag@campus.edu', '9876543299', true, 'CUSTOMER', 'c1111111-1111-1111-1111-111111111111', NULL, true),
  ('user-shop-1', 'YumQuick Kitchen', 'kitchen@yumquick.com', '9876543210', true, 'SHOP_OWNER', 'c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', true),
  ('user-admin-1', 'Platform Admin', 'admin@gobite.com', '9876500001', true, 'SUPER_ADMIN', 'c1111111-1111-1111-1111-111111111111', NULL, true),
  ('user-support-1', 'Campus Support', 'support@gobite.com', '9876500002', true, 'QUERY_RESOLVER', 'c1111111-1111-1111-1111-111111111111', NULL, true)
ON CONFLICT (id) DO UPDATE SET
  active_campus_id = EXCLUDED.active_campus_id,
  shop_id = EXCLUDED.shop_id,
  role = EXCLUDED.role;
