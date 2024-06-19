import { publicEnv } from '@root/config/public';
import { getCollections } from '@collections';
import { redirect, type Actions, error } from '@sveltejs/kit';

// Auth
import { auth, initializationPromise } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Paraglidejs
import { setLanguageTag, sourceLanguageTag, availableLanguageTags } from '@src/paraglide/runtime';

export async function load({ cookies }) {
	console.log('Load function started.');

	// Wait for initialization to complete
	if (initializationPromise) {
		console.log('Waiting for initialization promise...');
		await initializationPromise.catch((e) => console.error('Initialization failed:', e));
		console.log('Initialization promise resolved.');
	}

	// Get the session cookie
	const sessionId = cookies.get(SESSION_COOKIE_NAME);
	console.log('Session ID:', sessionId);

	if (!sessionId) {
		console.error('Session ID is missing from cookies');
		// Redirect or handle error as needed
		throw redirect(302, '/login');
	}

	if (!auth) {
		console.error('Authentication system is not initialized - src/routes/+page.server.ts');
		throw error(500, 'Internal Server Error');
	}

	// Validate the user's session
	const user = await auth.validateSession({ sessionId });
	console.log('User:', user);

	if (!user) {
		console.warn('User not found, redirecting to login.');
		throw redirect(302, `/login`);
	}

	// Get the collections and filter based on reading permissions
	const collections = await getCollections();
	console.log('Collections:', collections);

	const _filtered = Object.values(collections).filter((c: any) => user && c?.permissions?.[user.role]?.read != false);
	console.log('Filtered collections:', _filtered);

	if (_filtered.length == 0) {
		console.error('No collections found for user.');
		throw error(404, {
			message: "You don't have access to any collection"
		});
	}

	// Redirect to the first collection in the collections array
	throw redirect(302, `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${_filtered[0].name}`);
}

export const actions = {
	default: async ({ cookies, request }) => {
		const data = await request.formData();
		const theme = data.get('theme') === 'light' ? 'light' : 'dark';

		let systemlanguage = data.get('systemlanguage') as string; // get the system language from the form data

		// Check if the provided system language is available, if not, default to source language
		if (!availableLanguageTags.includes(sourceLanguageTag)) {
			systemlanguage = sourceLanguageTag;
		}

		// Set the cookies
		cookies.set('theme', theme, { path: '/' });
		cookies.set('systemlanguage', systemlanguage, { path: '/' });

		// Update the language tag in paraglide
		setLanguageTag(systemlanguage as any);

		// Store the system language and theme color in local storage
		localStorage.setItem('systemlanguage', systemlanguage);
		localStorage.setItem('theme', theme);

		throw redirect(303, '/');
	}
} satisfies Actions;
