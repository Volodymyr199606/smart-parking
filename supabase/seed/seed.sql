-- Smart Parking: Seed Data
-- 25 realistic mock parking spots around San Francisco.
-- Run this after applying the initial migration.

INSERT INTO public.parking_spots (street_name, address, latitude, longitude, status, parking_type, price, time_limit, source) VALUES

-- Financial District
('Market St', '100 Market St, San Francisco, CA', 37.7936, -122.3958, 'AVAILABLE', 'METERED', '$3.50/hr', '2 hours', 'MOCK'),
('Montgomery St', '350 Montgomery St, San Francisco, CA', 37.7922, -122.4028, 'OCCUPIED', 'METERED', '$3.50/hr', '1 hour', 'MOCK'),
('Kearny St', '200 Kearny St, San Francisco, CA', 37.7905, -122.4040, 'AVAILABLE', 'METERED', '$3.00/hr', '2 hours', 'MOCK'),

-- Union Square / Downtown
('Powell St', '50 Powell St, San Francisco, CA', 37.7870, -122.4080, 'OCCUPIED', 'METERED', '$4.00/hr', '1 hour', 'MOCK'),
('Geary St', '245 Geary St, San Francisco, CA', 37.7872, -122.4068, 'AVAILABLE', 'METERED', '$3.50/hr', '2 hours', 'MOCK'),
('Stockton St', '150 Stockton St, San Francisco, CA', 37.7865, -122.4065, 'UNKNOWN', 'METERED', '$3.50/hr', '1 hour', 'MOCK'),

-- SoMa
('Howard St', '500 Howard St, San Francisco, CA', 37.7880, -122.3965, 'AVAILABLE', 'FREE', NULL, NULL, 'MOCK'),
('Folsom St', '700 Folsom St, San Francisco, CA', 37.7845, -122.3985, 'AVAILABLE', 'METERED', '$2.50/hr', '4 hours', 'MOCK'),
('Brannan St', '300 Brannan St, San Francisco, CA', 37.7820, -122.3930, 'OCCUPIED', 'LOADING_ZONE', NULL, '30 min', 'MOCK'),
('Harrison St', '600 Harrison St, San Francisco, CA', 37.7835, -122.3960, 'AVAILABLE', 'FREE', NULL, NULL, 'MOCK'),

-- Mission District
('Mission St', '2400 Mission St, San Francisco, CA', 37.7590, -122.4185, 'AVAILABLE', 'METERED', '$2.00/hr', '2 hours', 'MOCK'),
('Valencia St', '800 Valencia St, San Francisco, CA', 37.7610, -122.4215, 'OCCUPIED', 'METERED', '$2.50/hr', '2 hours', 'MOCK'),
('16th St', '3100 16th St, San Francisco, CA', 37.7650, -122.4240, 'AVAILABLE', 'FREE', NULL, NULL, 'MOCK'),
('Guerrero St', '500 Guerrero St, San Francisco, CA', 37.7625, -122.4235, 'UNKNOWN', 'STREET_SWEEPING', NULL, 'No parking Mon 8-10am', 'MOCK'),

-- Castro / Noe Valley
('Castro St', '400 Castro St, San Francisco, CA', 37.7615, -122.4350, 'AVAILABLE', 'METERED', '$2.00/hr', '2 hours', 'MOCK'),
('24th St', '3800 24th St, San Francisco, CA', 37.7515, -122.4290, 'OCCUPIED', 'METERED', '$2.00/hr', '1 hour', 'MOCK'),
('Church St', '100 Church St, San Francisco, CA', 37.7680, -122.4290, 'AVAILABLE', 'FREE', NULL, NULL, 'MOCK'),

-- Haight-Ashbury
('Haight St', '1500 Haight St, San Francisco, CA', 37.7700, -122.4485, 'AVAILABLE', 'METERED', '$2.00/hr', '2 hours', 'MOCK'),
('Ashbury St', '200 Ashbury St, San Francisco, CA', 37.7695, -122.4470, 'UNKNOWN', 'FREE', NULL, NULL, 'MOCK'),

-- Marina / Cow Hollow
('Chestnut St', '2200 Chestnut St, San Francisco, CA', 37.8005, -122.4370, 'AVAILABLE', 'METERED', '$3.00/hr', '2 hours', 'MOCK'),
('Union St', '1900 Union St, San Francisco, CA', 37.7985, -122.4320, 'OCCUPIED', 'METERED', '$3.00/hr', '1 hour', 'MOCK'),
('Fillmore St', '2000 Fillmore St, San Francisco, CA', 37.7930, -122.4340, 'AVAILABLE', 'FREE', NULL, NULL, 'MOCK'),

-- North Beach / Fisherman''s Wharf
('Columbus Ave', '500 Columbus Ave, San Francisco, CA', 37.7990, -122.4095, 'OCCUPIED', 'METERED', '$3.50/hr', '1 hour', 'MOCK'),
('Beach St', '600 Beach St, San Francisco, CA', 37.8070, -122.4180, 'AVAILABLE', 'GARAGE', '$5.00/hr', NULL, 'MOCK'),

-- Richmond / Sunset
('Clement St', '300 Clement St, San Francisco, CA', 37.7830, -122.4630, 'AVAILABLE', 'FREE', NULL, NULL, 'MOCK'),
('Irving St', '1200 Irving St, San Francisco, CA', 37.7640, -122.4700, 'OCCUPIED', 'METERED', '$1.50/hr', '2 hours', 'MOCK');
