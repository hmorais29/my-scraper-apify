const { Actor } = require('apify');
const { RequestQueue, CheerioCrawler, Dataset } = require('crawlee');

const main = async () => {
    await Actor.init();
    
    const input = await Actor.getInput();
    
    // Sites alternativos de imóveis portugueses para testar
    const alternativeSites = [
        {
            url: 'https://www.imo7.pt/comprar/apartamentos/lisboa',
            name: 'IMO7',
            selectors: {
                container: '.property-item, .imovel-item, .property',
                title: 'h3 a, .title a, h2 a',
                price: '.price, .valor, .preco',
                location: '.location, .localidade, .zona'
            }
        },
        {
            url: 'https://casa.sapo.pt/Venda/Apartamentos/Lisboa/',
            name: 'Casa Sapo',
            selectors: {
                container: '.property-item, .searchResultProperty, .property',
                title: 'h2 a, .propertyTitle a, .title a',
                price: '.propertyPrice, .price, .valor',
                location: '.propertyLocation, .location, .zona'
            }
        },
        {
            url: 'https://www.remax.pt/comprar/apartamento/lisboa',
            name: 'RE/MAX',
            selectors: {
                container: '.property-card, .property-item, .listing-item',
                title: 'h3 a, .title a, .property-title a',
                price: '.price, .property-price, .valor',
                location: '.address, .location, .zona'
            }
        }
    ];
    
    // Usar URL fornecida pelo utilizador ou primeira alternativa
    let targetSite;
    if (input.url && input.url.includes('idealista')) {
        console.log('⚠️  Idealista detectado - vai tentar mas provavelmente será bloqueado');
        targetSite = {
            url: input.url,
            name: 'Idealista',
            selectors: {
                container: '.item-info-container, .item',
                title: 'h2 a, .item-link',
                price: '.item-price, .price',
                location: '.item-location, .location'
            }
        };
    } else if (input.url) {
        targetSite = {
            url: input.url,
            name: 'Site personalizado',
            selectors: {
                container: '.property-item, .item, article, .listing',
                title: 'h2 a, h3 a, .title a, .property-title',
                price: '.price, .valor, .property-price',
                location: '.location, .address, .zona'
            }
        };
    } else {
        targetSite = alternativeSites[0]; // IMO7 por defeito
    }
    
    console.log(`🎯 Alvo: ${targetSite.name} - ${targetSite.url}`);
    
    const requestQueue = await RequestQueue.open();
    await requestQueue.addRequest({ 
        url: targetSite.url,
        userData: { site: targetSite },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Referer': 'https://www.google.pt/',
            'Cache-Control': 'max-age=0',
        }
    });
    
    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestRetries: 2,
        maxConcurrency: 1,
        
        requestHandler: async ({ request, $, response }) => {
            const siteInfo = request.userData.site;
            console.log(`\n🏠 Processando: ${siteInfo.name}`);
            console.log(`📊 Status: ${response.statusCode}`);
            
            if (response.statusCode === 403) {
                console.log(`❌ ${siteInfo.name} está a bloquear (403)`);
                
                // Se for Idealista bloqueado, tentar site alternativo
                if (siteInfo.name === 'Idealista' && alternativeSites.length > 0) {
                    console.log('🔄 Tentando site alternativo...');
                    const altSite = alternativeSites[0];
                    await requestQueue.addRequest({ 
                        url: altSite.url,
                        userData: { site: altSite },
                        headers: request.headers
                    });
                }
                return;
            }
            
            if (response.statusCode !== 200) {
                console.log(`❌ Status: ${response.statusCode}`);
                return;
            }
            
            console.log(`✅ ${siteInfo.name} acessível!`);
            
            const pageTitle = $('title').text();
            console.log(`📄 Título: ${pageTitle.substring(0, 80)}...`);
            
            // Usar seletores específicos do site
            const containers = $(siteInfo.selectors.container);
            console.log(`🔍 Encontrados ${containers.length} containers com: ${siteInfo.selectors.container}`);
            
            if (containers.length === 0) {
                console.log('🕵️ Procurando outros seletores...');
                
                // Tentar seletores genéricos
                const genericSelectors = [
                    'article', '.property', '.listing', '.item', '.card',
                    '[class*="property"]', '[class*="imovel"]', '[class*="casa"]',
                    '[class*="apartamento"]', '[data-*]'
                ];
                
                let found = false;
                for (const selector of genericSelectors) {
                    const elements = $(selector);
                    if (elements.length > 5) { // Pelo menos 5 elementos
                        console.log(`✅ Encontrados ${elements.length} com: ${selector}`);
                        siteInfo.selectors.container = selector;
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    console.log('❌ Nenhum container de propriedades encontrado');
                    // Mostrar estrutura da página
                    const bodyClasses = $('body').attr('class') || '';
                    console.log(`Body classes: ${bodyClasses}`);
                    
                    // Contar elementos por tipo
                    const elementCounts = {};
                    $('*').each((i, el) => {
                        const className = $(el).attr('class');
                        if (className) {
                            className.split(' ').forEach(cls => {
                                if (cls.length > 2) {
                                    elementCounts[cls] = (elementCounts[cls] || 0) + 1;
                                }
                            });
                        }
                    });
                    
                    // Mostrar classes mais comuns
                    const topClasses = Object.entries(elementCounts)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 10);
                    
                    console.log('Classes mais comuns:');
                    topClasses.forEach(([cls, count]) => {
                        console.log(`  .${cls}: ${count}`);
                    });
                    
                    return;
                }
            }
            
            // Extrair dados
            const properties = [];
            $(siteInfo.selectors.container).slice(0, 15).each((i, el) => {
                const item = $(el);
                
                // Tentar extrair título e link
                let title = '', link = '';
                const titleSelectors = siteInfo.selectors.title.split(', ');
                for (const titleSel of titleSelectors) {
                    const titleEl = item.find(titleSel);
                    if (titleEl.length > 0) {
                        title = titleEl.text().trim();
                        link = titleEl.attr('href') || '';
                        if (link && !link.startsWith('http')) {
                            const baseUrl = new URL(request.url).origin;
                            link = baseUrl + (link.startsWith('/') ? link : '/' + link);
                        }
                        break;
                    }
                }
                
                // Extrair preço
                let price = '';
                const priceSelectors = siteInfo.selectors.price.split(', ');
                for (const priceSel of priceSelectors) {
                    const priceEl = item.find(priceSel);
                    if (priceEl.length > 0) {
                        price = priceEl.text().trim();
                        break;
                    }
                }
                
                // Extrair localização
                let location = '';
                const locationSelectors = siteInfo.selectors.location.split(', ');
                for (const locSel of locationSelectors) {
                    const locEl = item.find(locSel);
                    if (locEl.length > 0) {
                        location = locEl.text().trim();
                        break;
                    }
                }
                
                if (title && price) {
                    properties.push({
                        title: title.substring(0, 200),
                        price: price.substring(0, 50),
                        location: location.substring(0, 100),
                        link: link,
                        source: siteInfo.name,
                        sourceUrl: request.url,
                        scrapedAt: new Date().toISOString()
                    });
                }
            });
            
            console.log(`📊 Extraídos ${properties.length} imóveis`);
            
            if (properties.length > 0) {
                // Mostrar primeiros resultados
                properties.slice(0, 3).forEach((prop, i) => {
                    console.log(`\n🏡 Imóvel ${i + 1}:`);
                    console.log(`  📝 ${prop.title.substring(0, 60)}...`);
                    console.log(`  💰 ${prop.price}`);
                    console.log(`  📍 ${prop.location}`);
                });
                
                await Dataset.pushData(properties);
                console.log(`✅ ${properties.length} imóveis guardados!`);
            } else {
                console.log('❌ Nenhum imóvel extraído');
            }
            
            // Procurar próxima página (máximo 2 páginas)
            const queueInfo = await requestQueue.getInfo();
            if (queueInfo.totalRequestCount < 2 && properties.length > 5) {
                const nextSelectors = [
                    'a.next-page', '.pagination .next', '[aria-label*="next"]',
                    '[aria-label*="próxima"]', '.next', '.seguinte'
                ];
                
                let nextUrl = null;
                for (const selector of nextSelectors) {
                    const nextEl = $(selector);
                    if (nextEl.length > 0) {
                        nextUrl = nextEl.attr('href');
                        if (nextUrl) break;
                    }
                }
                
                if (nextUrl) {
                    if (!nextUrl.startsWith('http')) {
                        const baseUrl = new URL(request.url).origin;
                        nextUrl = baseUrl + (nextUrl.startsWith('/') ? nextUrl : '/' + nextUrl);
                    }
                    console.log(`➡️  Próxima página: ${nextUrl}`);
                    await requestQueue.addRequest({ 
                        url: nextUrl, 
                        userData: { site: siteInfo },
                        headers: request.headers
                    });
                }
            }
        },
        
        failedRequestHandler: async ({ request, error }) => {
            console.log(`❌ Falha: ${request.url} - ${error.message}`);
        },
    });
    
    await crawler.run();
    
    console.log('\n🎉 Scraping concluído!');
    await Actor.exit();
};

main().catch(console.error);
