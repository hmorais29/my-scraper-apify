import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';
import fs from 'fs';

await Actor.init();

const BASE_URL = 'https://www.imovirtual.com/comprar/apartamento/';

const locations = {};

function normalize(text) {
    return text.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function generateAliases(slug) {
    const aliases = new Set();
    aliases.add(slug);
    aliases.add(slug.replace(/-/g, ' '));

    if (slug.includes('-e-')) {
        const parts = slug.split('-e-');
        for (const part of parts) {
            aliases.add(part);
            aliases.add(part.replace(/-/g, ' '));
        }
    }
    return Array.from(aliases);
}

const crawler = new CheerioCrawler({
    async requestHandler({ $, request }) {
        console.log(`✅ Visitando: ${request.url}`);

        $('a[href*="/comprar/apartamento/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;

            const parts = href.split('/').filter(Boolean);
            const idx = parts.indexOf('apartamento');
            if (idx === -1) return;

            const remainder = parts.slice(idx + 1);
            if (remainder.length >= 3) {
                const [district, concelho, freg] = remainder;
                if (!locations[district]) locations[district] = {};
                if (!locations[district][concelho]) locations[district][concelho] = {};

                if (!locations[district][concelho][freg]) {
                    locations[district][concelho][freg] = generateAliases(freg);
                }
            }
        });
    }
});

await crawler.run([BASE_URL]);

// Guardar localmente
fs.writeFileSync('locations.json', JSON.stringify(locations, null, 2), 'utf8');

// Guardar no dataset Apify
await Actor.pushData({ createdAt: new Date().toISOString(), locations });

console.log('✅ locations.json gerado');
await Actor.exit();
