/**
 * @file src/routes/api/collectionCompile/+server.ts
 * @description API endpoint for collection compilation
 *
 * Features:
 * - TypeScript compilation for collections
 * - Collection updates post-compilation
 * - Cooldown and force update support
 * - Performance monitoring
 * - Error handling and logging
 */

import type { RequestHandler } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';

// Collection Manager
import { collectionManager } from '@src/collections/CollectionManager';

// Compilation
import { compile } from '@api/collectionCompile/compile';

// System Logger
import { logger } from '@src/utils/logger';

// Constants
const COMPILE_COOLDOWN = 60000; // 1 minute cooldown

// Compilation state
let isCompiling = false;
let lastCompileTime = 0;

// Helper function to handle compilation
async function handleCompilation(forceUpdate: boolean = false): Promise<void> {
	try {
		// Only compile if forced or if it's been a while since the last compilation
		if (forceUpdate || Date.now() - lastCompileTime > COMPILE_COOLDOWN) {
			await compile();
			logger.debug('Compilation completed successfully');
		}

		// Always update collections, but only recompile if forced
		await collectionManager.updateCollections(forceUpdate);
		logger.info('Collections updated successfully');
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error during compilation process', { error: errorMessage });
		throw new Error(`Compilation process failed: ${errorMessage}`);
	}
}

export const GET: RequestHandler = async ({ url }) => {
	// Extract 'force' query parameter to determine if update should be forced
	const forceUpdate = url.searchParams.get('force') === 'true';
	const currentTime = Date.now();

	// Check if compilation is already in progress
	if (isCompiling) {
		return json({
			success: true,
			message: 'Compilation already in progress'
		});
	}

	// Check cooldown unless force update
	if (!forceUpdate && currentTime - lastCompileTime < COMPILE_COOLDOWN) {
		return json({
			success: true,
			message: 'Compilation skipped due to cooldown'
		});
	}

	isCompiling = true;
	lastCompileTime = currentTime;

	try {
		logger.info('Starting compilation process', { forceUpdate });
		await handleCompilation(forceUpdate);

		isCompiling = false;
		return json({
			success: true,
			message: 'Compilation and collection update completed',
			timestamp: currentTime
		});
	} catch (err) {
		isCompiling = false;
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error during compilation process', { error: errorMessage });
		throw error(500, errorMessage);
	}
};

// POST endpoint for forced compilation
export const POST: RequestHandler = async () => {
	const currentTime = Date.now();

	if (isCompiling) {
		return json({
			success: true,
			message: 'Compilation already in progress'
		});
	}

	isCompiling = true;
	lastCompileTime = currentTime;

	try {
		logger.info('Starting forced compilation process');
		await handleCompilation(true);

		isCompiling = false;
		return json({
			success: true,
			message: 'Forced compilation and collection update completed',
			timestamp: currentTime
		});
	} catch (err) {
		isCompiling = false;
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error during forced compilation process', { error: errorMessage });
		throw error(500, errorMessage);
	}
};
