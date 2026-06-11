-- ============================================================
-- Esquema D1 para CasasBarinas
-- Base de datos: generico_db
-- ID: 38dd85ba-03dc-4937-af19-4d1c41a18f27
-- ============================================================

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'agent')),
  avatar TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tabla de propiedades
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT NOT NULL CHECK(property_type IN (
    'casa', 'apartamento', 'terreno', 'local_comercial', 
    'oficina', 'hotel', 'finca', 'galpon', 'estacionamiento', 'otro'
  )),
  operation_type TEXT NOT NULL CHECK(operation_type IN ('venta', 'alquiler', 'venta_alquiler')),
  price REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  address TEXT,
  city TEXT DEFAULT 'Barinas',
  state TEXT DEFAULT 'Barinas',
  country TEXT DEFAULT 'Venezuela',
  lat REAL,
  lng REAL,
  bedrooms INTEGER,
  bathrooms INTEGER,
  parking_spaces INTEGER,
  area REAL,
  area_unit TEXT DEFAULT 'm2',
  year_built INTEGER,
  floors INTEGER,
  has_pool INTEGER DEFAULT 0,
  has_garden INTEGER DEFAULT 0,
  has_ac INTEGER DEFAULT 0,
  has_kitchen INTEGER DEFAULT 0,
  has_furniture INTEGER DEFAULT 0,
  has_security INTEGER DEFAULT 0,
  has_elevator INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'sold', 'rented')),
  featured INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Tabla de imágenes (property_images in generico_db)
CREATE TABLE IF NOT EXISTS property_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  is_cover INTEGER DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

-- Tabla de mensajes/contactos (property_contacts in generico_db)
CREATE TABLE IF NOT EXISTS property_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_phone TEXT,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Tabla de favoritos (property_favorites in generico_db)
CREATE TABLE IF NOT EXISTS property_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, property_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_operation ON properties(operation_type);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_user ON properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_latlng ON properties(lat, lng);
CREATE INDEX IF NOT EXISTS idx_property_images_property ON property_images(property_id);
CREATE INDEX IF NOT EXISTS idx_property_contacts_property ON property_contacts(property_id);
CREATE INDEX IF NOT EXISTS idx_property_favorites_user ON property_favorites(user_id);

-- Usuario admin por defecto (password: admin123 - hash SHA-256)
-- En producción cambiar la contraseña
INSERT OR IGNORE INTO users (name, email, phone, password_hash, role) VALUES 
('Administrador', 'admin@casasbarinas.com', '+58-000-0000000', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin');
