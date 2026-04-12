-- CMS tables for Voltz (run after mysql-aiven-bootstrap.sql)
-- USE your database first.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS cms_config (
  `key` VARCHAR(128) NOT NULL PRIMARY KEY,
  `value` LONGTEXT,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cms_categories (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `slug` VARCHAR(128) NOT NULL,
  `name` VARCHAR(512) NOT NULL,
  `description` TEXT,
  `color` VARCHAR(32) DEFAULT '#e31e24',
  `icon` VARCHAR(64) DEFAULT 'Package',
  `product_count` INT NOT NULL DEFAULT 0,
  `visible` TINYINT(1) NOT NULL DEFAULT 1,
  `is_custom` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_cms_categories_slug (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cms_custom_products (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `name` VARCHAR(512) NOT NULL,
  `other_names` VARCHAR(1024) NOT NULL DEFAULT '',
  `category` VARCHAR(256) NOT NULL DEFAULT '',
  `category_slug` VARCHAR(128) NOT NULL DEFAULT '',
  `brand` VARCHAR(256) NOT NULL DEFAULT '',
  `price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `original_price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `rating` DECIMAL(4,2) NOT NULL DEFAULT 0,
  `reviews` INT NOT NULL DEFAULT 0,
  `in_stock` TINYINT(1) NOT NULL DEFAULT 1,
  `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
  `show_on_website` TINYINT(1) NOT NULL DEFAULT 1,
  `stock_count` INT NOT NULL DEFAULT 0,
  `badge` VARCHAR(512) NOT NULL DEFAULT '',
  `badge_color` VARCHAR(64) NOT NULL DEFAULT '',
  `image` TEXT,
  `additional_images` LONGTEXT,
  `description` MEDIUMTEXT,
  `specs` LONGTEXT,
  `features` LONGTEXT,
  `part_number` VARCHAR(256) NOT NULL DEFAULT '',
  `warranty` VARCHAR(256) NOT NULL DEFAULT '',
  `weight` VARCHAR(64) NOT NULL DEFAULT '',
  `dimensions` VARCHAR(128) NOT NULL DEFAULT '',
  `voltage` VARCHAR(64) NOT NULL DEFAULT '',
  `amperage` VARCHAR(64) NOT NULL DEFAULT '',
  `phase` VARCHAR(64) NOT NULL DEFAULT '',
  `power` VARCHAR(64) NOT NULL DEFAULT '',
  `documents` LONGTEXT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_cms_products_category (`category_slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cms_product_overrides (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `product_id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(512) NULL,
  `price` DECIMAL(12,2) NULL,
  `original_price` DECIMAL(12,2) NULL,
  `image` TEXT NULL,
  `description` MEDIUMTEXT NULL,
  `brand` VARCHAR(256) NULL,
  `in_stock` TINYINT(1) NULL,
  `is_featured` TINYINT(1) NULL,
  `badge` VARCHAR(512) NULL,
  `badge_color` VARCHAR(64) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_cms_overrides_product (`product_id`),
  KEY idx_cms_overrides_product_id (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
