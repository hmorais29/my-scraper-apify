import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

const testUrl = 'https://www.imovirtual.com/pt/resultados/comprar/apartamento,t3/lisboa/loures/santo-antonio-dos-cavaleiros-e-frielas/santo-antonio-dos-cavaleiros?limit=36&ownerTypeSingleSelect=ALL&by=DEFAULT&direction=DESC&search%5Bfilter_enum_builttype%5D=1';

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 30,
    
    async requestHandler({ $, response, request }) {
        console.log('🔍 ANÁLISE DETALHADA DOS 216 ELEMENTOS [data-cy*="listing"]');
        console.log('========================================================');
        
        const listingElements = $('[data-cy*="listing"]');
        console.log(`Total de elementos encontrados: ${listingElements.length}`);
        
        // Analisar os primeiros 10 elementos
        listingElements.slice(0, 15).each((index, element) => {
            const $el = $(element);
            const dataCy = $el.attr('data-cy');
            const text = $el.text().trim().substring(0, 200);
            const hasPrice = text.includes('€');
            const hasT = /T[0-9]/.test(text);
            const tagName = element.tagName;
            
            console.log(`\n--- ELEMENTO ${index + 1} ---`);
            console.log(`Tag: ${tagName}`);
            console.log(`data-cy: ${dataCy}`);
            console.log(`Tem preço: ${hasPrice}`);
            console.log(`Tem tipologia: ${hasT}`);
            console.log(`Texto (200 chars): ${text}`);
            
            // Verificar filhos
            const children = $el.children();
            console.log(`Filhos diretos: ${children.length}`);
            
            // Procurar links dentro do elemento
            const links = $el.find('a[href]');
            console.log(`Links encontrados: ${links.length}`);
            if (links.length > 0) {
                const firstLink = links.first().attr('href');
                console.log(`Primeiro link: ${firstLink}`);
            }
        });
        
        // Procurar especificamente pelos seletores mais promissores
        console.log('\n🎯 ANÁLISE DE SELETORES ESPECÍFICOS:');
        
        const specificSelectors = [
            '[data-cy="search.listing.organic"]',
            '[data-cy*="organic"]', 
            '[data-cy*="search"]',
            'div[data-cy*="listing"] article',
            'article[data-cy]',
            'div[data-cy*="search"] > *',
            '[data-cy="search.listing.organic"] article',
            '[data-cy="search.listing.organic"] > *'
        ];
        
        specificSelectors.forEach(selector => {
            const elements = $(selector);
            console.log(`\n${selector}: ${elements.length} elementos`);
            
            if (elements.length > 0 && elements.length < 50) {
                elements.slice(0, 3).each((i, el) => {
                    const $el = $(el);
                    const text = $el.text().trim().substring(0, 100);
                    const hasUsefulContent = text.includes('€') || /T[0-9]/.test(text);
                    console.log(`  - Elemento ${i + 1}: ${hasUsefulContent ? '✅ HAS CONTENT' : '❌ NO CONTENT'} - ${text}`);
                });
            }
        });
        
        // Procurar por elementos que contenham preços explicitamente
        console.log('\n💰 ELEMENTOS COM PREÇOS:');
        const elementsWithPrice = $('*').filter(function() {
            return $(this).text().includes('€') && $(this).text().match(/\d+.*€/);
        });
        
        console.log(`Elementos com €: ${elementsWithPrice.length}`);
        
        elementsWithPrice.slice(0, 5).each((i, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            const priceMatch = text.match(/\d[\d\s,\.]*\s*€/g);
            console.log(`  - ${el.tagName}: ${priceMatch ? priceMatch.join(', ') : 'sem preço claro'}`);
            console.log(`    data-cy: ${$el.attr('data-cy') || 'none'}`);
            console.log(`    classe: ${$el.attr('class') || 'none'}`);
        });
        
        // Verificar se existem dados estruturados (JSON-LD ou scripts com dados)
        console.log('\n📊 PROCURAR DADOS ESTRUTURADOS:');
        const jsonLdScripts = $('script[type="application/ld+json"]');
        console.log(`Scripts JSON-LD: ${jsonLdScripts.length}`);
        
        const scriptsWithData = $('script').filter(function() {
            const text = $(this).html() || '';
            return text.includes('listing') || text.includes('property') || text.includes('price');
        });
        console.log(`Scripts com dados relevantes: ${scriptsWithData.length}`);
        
        await Actor.pushData({
            type: 'DETAILED_ANALYSIS',
            totalListingElements: listingElements.length,
            elementsWithPrice: elementsWithPrice.length,
            jsonLdScripts: jsonLdScripts.length,
            scriptsWithData: scriptsWithData.length
        });
    }
});

await crawler.run([testUrl]);
await Actor.exit();
