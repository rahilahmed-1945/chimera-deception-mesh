import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Static single-page app: cheapest thing to host, served from the free
    // Zerops static base. index.html is the SPA fallback for client routing.
    adapter: adapter({ fallback: 'index.html' }),
  },
};

export default config;
