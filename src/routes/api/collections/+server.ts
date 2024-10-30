/**
 * @file src/routes/api/collections/+server.ts
 * @description API endpoints for collection management
 *
 * Features:
 * - Collection data retrieval with Memory cache or optional Redis caching
 * - File-based collection operations
 * - Collection structure updates
 * - Category management integration
 * - Performance optimized with batch processing
 */

import path from 'path';
import fs from 'fs/promises';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { browser } from '$app/environment';

// Collection Manager
import { collectionManager } from '@src/collections/CollectionManager';

// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';

// System Logger
import { logger } from '@src/utils/logger';

// Constants
const CACHE_TTL = 300; // 5 minutes
const COLLECTIONS_FOLDER = process.env.VITE_COLLECTIONS_FOLDER || './collections';
const BATCH_SIZE = 50;

// Safely parse collection file content
function safeParseCollectionFile(content: string) {
	try {
		const sanitizedContent = content
			.replace(/\bfunction\b/g, '"function"')
			.replace(/\beval\b/g, '"eval"')
			.replace(/\bnew\b/g, '"new"')
			.replace(/\bclass\b/g, '"class"');

		const parsed = JSON.parse(sanitizedContent);
		if (typeof parsed !== 'object' || parsed === null) {
			throw new Error('Invalid collection file structure');
		}

		return { default: parsed };
	} catch (err) {
		logger.error('Error parsing collection file:', err);
		throw new Error('Invalid collection file format');
	}
}

// Process files in batches
async function processBatch(files: string[], baseFolder: string) {
	return Promise.all(
		files.map(async (file) => {
			const filePath = path.join(baseFolder, file);
			const content = await fs.readFile(filePath, 'utf-8');
			return safeParseCollectionFile(content);
		})
	);
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const action = url.searchParams.get('action');
		const name = url.searchParams.get('name');

		// Try Redis cache first
		if (!browser && isRedisEnabled()) {
			const cacheKey = `api:collections:${action || 'default'}${name ? `:${name}` : ''}`;
			const cached = await getCache(cacheKey);
			if (cached) {
				logger.debug('Returning cached collection data', { action, name });
				return json(cached);
			}
		}

		const { collections, categories } = collectionManager.getCollectionData();
		let response;
		let foundCollection;

		switch (action) {
			case 'structure':
				// Return full collection structure with categories
				logger.info('Returning collection structure');
				response = { collections, categories };
				break;

			case 'files': {
				// Return collection files with batch processing
				const files = await fs.readdir(path.resolve(COLLECTIONS_FOLDER));
				const jsFiles = files.filter((f) => f.endsWith('.js'));

				// Process files in batches
				const batches = [];
				for (let i = 0; i < jsFiles.length; i += BATCH_SIZE) {
					batches.push(jsFiles.slice(i, i + BATCH_SIZE));
				}

				const results = await Promise.all(batches.map((batch) => processBatch(batch, COLLECTIONS_FOLDER)));
				response = results.flat();
				break;
			}

			case 'file': {
				// Return specific collection file
				if (!name) throw error(400, 'File name required');
				const fileName = path.basename(name);
				const filePath = path.join(path.resolve(COLLECTIONS_FOLDER), fileName);

				if (!filePath.startsWith(path.resolve(COLLECTIONS_FOLDER))) {
					throw error(400, 'Invalid file path');
				}

				const content = await fs.readFile(filePath, 'utf-8');
				response = safeParseCollectionFile(content);
				break;
			}

			case 'names':
				// Return just collection names
				logger.info('Returning collection names');
				response = collections.map((col) => col.name);
				break;

			case 'collection':
				// Return a specific collection
				if (!name) {
					throw error(400, 'Collection name is required');
				}

				foundCollection = collections.find((c) => c.name === name);
				if (!foundCollection) {
					throw error(404, 'Collection not found');
				}

				logger.info(`Returning collection: ${name}`);
				response = foundCollection;
				break;

			default:
				// Default: return basic collection data
				logger.info('Returning basic collection data');
				response = {
					success: true,
					collections: collections.map(({ name, icon, path }) => ({
						name,
						icon,
						path
					}))
				};
		}

		// Cache in Redis if available
		if (!browser && isRedisEnabled()) {
			const cacheKey = `api:collections:${action || 'default'}${name ? `:${name}` : ''}`;
			await setCache(cacheKey, response, CACHE_TTL);
		}

		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in collections API:', message);
		throw error(500, `Failed to process collections request: ${message}`);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		const action = data.action;

		switch (action) {
			case 'recompile':
				// Clear Redis cache if available
				if (!browser && isRedisEnabled()) {
					await clearCache('api:collections:*');
				}

				// Force recompilation of collections
				await collectionManager.updateCollections(true);
				logger.info('Collections recompiled successfully');
				return json({
					success: true,
					message: 'Collections recompiled successfully'
				});

			default:
				throw error(400, 'Invalid action');
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in collections API:', message);
		throw error(500, `Failed to process collections request: ${message}`);
	}
};
