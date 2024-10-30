/**
 * @file src/routes/api/categories/+server.ts
 * @description API endpoints for category management
 *
 * Features:
 * - Category structure retrieval and updates
 * - Automatic backup support
 * - Category file generation with validation
 * - Efficient caching
 * - Error handling and logging
 */

import fs from 'fs/promises';
import path from 'path';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

// Collection Manager
import { collectionManager } from '@src/collections/CollectionManager';
import type { CategoryData } from '@src/collections/types';

import { backupCategoryFiles } from '../save-categories/backup-utils';
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';

// System Logger
import { logger } from '@utils/logger';

// Constants
const CACHE_TTL = 300; // 5 minutes

// Generate categories file content
function generateCategoriesFileContent(data: Record<string, CategoryData>): string {
	return `/**
 * @file src/collections/categories.ts
 * @description Category configuration generated from folder structure
 * 
 * ⚠️ WARNING: This is an auto-generated file.
 * DO NOT MODIFY DIRECTLY - Changes will be overwritten by the CMS.
 * 
 * This file is generated from:
 * 1. Folder structure in src/collections/
 * 2. GUI updates via /api/categories
 * 
 * Translations are stored in the database, not in this file.
 */

import type { CategoryData } from './types';

// Auto-generated category configuration
export const categoryConfig: Record<string, CategoryData> = ${JSON.stringify(data, null, 2)};
`;
}

// Validate category data
function validateCategoryData(data: unknown): asserts data is Record<string, CategoryData> {
	if (!data || typeof data !== 'object') {
		throw new Error('Invalid category data format');
	}

	for (const [key, value] of Object.entries(data)) {
		if (!value || typeof value !== 'object' || !value.name || !value.icon) {
			throw new Error(`Invalid category data for key "${key}"`);
		}
	}
}

// Save category file with validation
async function saveCategoryFile(data: Record<string, CategoryData>): Promise<void> {
	const categoriesPath = path.join(process.cwd(), 'src', 'collections', 'categories.ts');

	try {
		// Generate and validate content
		const content = generateCategoriesFileContent(data);
		if (!content.includes('export const categoryConfig')) {
			throw new Error('Generated content is invalid');
		}

		// Write file
		await fs.writeFile(categoriesPath, content, 'utf-8');
		logger.info('Categories file written successfully');
	} catch (error) {
		logger.error('Error saving categories file:', error);
		throw new Error('Failed to save categories file');
	}
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const action = url.searchParams.get('action');
		const cacheKey = `api:categories:${action || 'default'}`;

		// Try Redis cache first
		if (!browser && isRedisEnabled()) {
			const cached = await getCache(cacheKey);
			if (cached) {
				logger.debug('Returning cached category data');
				return json(cached);
			}
		}

		const { categories } = collectionManager.getCollectionData();
		const response = { success: true, categories };

		// Cache in Redis if available
		if (!browser && isRedisEnabled()) {
			await setCache(cacheKey, response, CACHE_TTL);
		}

		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in GET /api/categories:', message);
		throw error(500, 'Failed to fetch categories');
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		validateCategoryData(data);

		// Backup existing categories
		await backupCategoryFiles();
		logger.info('Category files backed up successfully');

		// Save new categories
		await saveCategoryFile(data);

		// Clear Redis cache if available
		if (!browser && isRedisEnabled()) {
			await clearCache('api:categories:*');
		}

		// Update collections to reflect changes
		await collectionManager.updateCollections(true);

		logger.info('Categories updated successfully');
		return json({ success: true, message: 'Categories updated successfully' });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in POST /api/categories:', message);
		throw error(500, `Failed to update categories: ${message}`);
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const { categoryId, updates } = await request.json();
		const { categories } = collectionManager.getCollectionData();

		// Find and update category
		function updateCategory(cats: Record<string, CategoryData>, id: string): boolean {
			for (const key in cats) {
				if (cats[key].id === categoryId) {
					// Update category properties
					Object.assign(cats[key], updates);
					return true;
				}
				if (cats[key].subcategories && updateCategory(cats[key].subcategories!, id)) {
					return true;
				}
			}
			return false;
		}

		if (updateCategory(categories, categoryId)) {
			// Backup existing categories
			await backupCategoryFiles();

			// Save updated categories
			await saveCategoryFile(categories);

			// Clear Redis cache if available
			if (!browser && isRedisEnabled()) {
				await clearCache('api:categories:*');
			}

			// Update collections
			await collectionManager.updateCollections(true);

			logger.info(`Category ${categoryId} updated successfully`);
			return json({
				success: true,
				message: 'Category updated successfully',
				categories
			});
		}

		throw error(404, 'Category not found');
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in PUT /api/categories:', message);
		throw error(500, `Failed to update category: ${message}`);
	}
};
