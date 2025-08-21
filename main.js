const { Actor } = require('apify');
const { RequestQueue, CheerioCrawler, Dataset } = require('crawlee');

const main = async () => {
    await Actor.init();
    
    const input = await Actor.getInput();
    console.log('📥 Input recebido:', input);
    
    const query = input.query || input.searchQuery || '';
    
    if (!query) {
        console.log('❌ Nenhuma query fornecida');
        await Actor.exit();
        return;
    }
    
    console.log(`🔍 Query: "${query}"`);
    
    const searchCriteria = parseQuery(query);
    console.log('📋 Critérios extraídos:', searchCriteria);
    
    function buildImovirtualUrl(criteria) {
        let url = 'https://www.imovirtual.com/comprar';
        
        if (criteria.type === 'apartamento') {
            url += '/apartamento';
        } else if (criteria.type === 'moradia') {
            url += '/moradia';
        }
        
        if (criteria.location) {
            url += `/${criteria.location.toLowerCase().replace(/\s+/g, '-')}`;
        }
        
        const params = new URLSearchParams();
        
        if (criteria.rooms) {
            const roomNum = criteria.rooms.replace('T', '');
            params.append('search%5Bfilter_float_number_of_rooms%3Afrom%5D', roomNum);
            params.append('search%5Bfilter_float_number_of_rooms%3Ato%5D', roomNum);
        }
        
        if (criteria.area) {
            params.append('search%5Bfilter_float_m%3Afrom%5D', Math.max(1, criteria.area - 20));
            params.append('search%5Bfilter_float_m%3Ato%5D', criteria.area + 20);
        }
        
        const queryString = params.toString();
        return queryString ? `${url}?${queryString}` : url;
    }

    function buildEraUrl(criteria) {
        let url = 'https://www.era.pt/comprar';
        
        if (criteria.type === 'apartamento') {
            url += '/apartamentos';
        } else if (criteria.type === 'moradia') {
            url += '/moradias';
        }
        
        if (criteria.location) {
            url += `/${criteria.location.toLowerCase().replace(/\s+/g, '-')}`;
        }
        
        return url;
    }

    function buildIdealistaUrl(criteria) {
        let url = 'https://www.idealista.pt/comprar-casas';
        
        if (criteria.location) {
            url += `/${criteria.location.toLowerCase().replace(/\s+/g, '-')}`;
        }
        
        const params = new URLSearchParams();
        
        if (criteria.type === 'apartamento') {
            params.append('tipologia', 'apartamentos');
        } else if (criteria.type === 'moradia') {
            params.append('tipologia', 'moradias');
        }
        
        if (criteria.rooms) {
            const roomNum = criteria.rooms.replace('T', '');
            params.append('quartos', roomNum);
        }
        
        if (criteria.area) {
            params.append('area_min', Math.max(1, criteria.area - 20));
            params.append('area_max', criteria.area + 20);
        }
        
        const queryString = params.toString();
        return queryString ? `${url}?${queryString}` : url;
    }

    const propertySites = [
        {
            name: 'Imovirtual',
            baseUrl: 'https://www.imovirtual.com',
            buildSearchUrl: buildImovirtualUrl,
            selectors: {
                container: 'article, [data-cy="listing-item"], .offer-item, .property-item, .css-1sw7q4x',
                title: 'a[title], h2 a, h3 a, [data-cy="listing-item-link"], .offer-item-title a, .css-16vl3c1 a',
                price: '.css-1uwck7i, [data-cy="price"], .offer-item-price, .price, [class*="price"]',
                location: '.css-12h460f, [data-cy="location"], .offer-item-location, .location',
                area: '.css-1wi9dc7, .offer-item-area, [data-cy="area"], .area, [class*="area"]',
                rooms: '.css-1wi9dc7, .offer-item-rooms, [data-cy="rooms"], .rooms, [class*="rooms"]'
            }
        },
        {
            name: 'ERA Portugal',
            baseUrl: 'https://www.era.pt',
            buildSearchUrl: buildEraUrl,
            selectors: {
                container: '.property-card, .listing-card, .property-item, .card',
                title: '.property-title a, h2 a, h3 a, .card-title a',
                price: '.property-price, .price, .valor, .card-price',
                location: '.property-location, .location, .address, .card-location',
                area: '.property-area, .area, .metros, .card-area',
                rooms: '.property-rooms, .tipologia, .quartos, .card-rooms'
            }
        },
        {
            name: 'Idealista Portugal',
            baseUrl: 'https://www.idealista.pt',
            buildSearchUrl: buildIdealistaUrl,
            selectors: {
                container: '.item, .listing-item, .property-card, [class*="item"]',
                title: '.item-link, h2 a, h3 a, [class*="title"] a',
                price: '.price-row, .item-price, [class*="price"], .listing-price',
                location: '.item-detail-location, .location, [class*="location"], .listing-address',
                area: '.item-detail-area, .area, [class*="area"], .listing-area',
                rooms: '.item-detail-rooms, .rooms, [class*="bedroom"], .tipologia'
            }
        }
    ];
    
    const requestQueue = await RequestQueue.open();
    
    for (const site of propertySites) {
        try {
            const searchUrl = site.buildSearchUrl(searchCriteria);
            if (searchUrl) {
                console.log(`🌐 ${site.name}: ${searchUrl}`);
                await requestQueue.addRequest({ 
                    url: searchUrl,
                    userData: { site, criteria: searchCriteria }
                });
            }
        } catch (error) {
            console.log(`❌ Erro ao construir URL para ${site.name}:`, error.message);
        }
    }
    
    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestRetries: 3,
        maxConcurrency: 1,
        maxRequestsPerMinute: 2,
        requestHandler: async ({ request, $, response }) => {
            const { site, criteria } = request.userData;
            
            console.log(`\n🏠 Processando ${site.name}...`);
            console.log(`📊 Status: ${response.statusCode}`);
            
            if (response.statusCode === 429 || response.statusCode === 403) {
                console.log(`🚫 ${site.name} bloqueou o request (${response.statusCode})`);
                return;
            }
            
            if (response.statusCode !== 200) {
                console.log(`❌ ${site.name} - Status: ${response.statusCode}`);
                return;
            }
            
            console.log(`✅ ${site.name} acessível!`);
            
            const properties = [];
            $(site.selectors.container).each((i, el) => {
                if (i >= 8) return;
                
                const property = {
                    title: '',
                    price: '',
                    location: '',
                    area: '',
                    rooms: '',
                    link: '',
                    source: site.name,
                    sourceUrl: request.url,
                    scrapedAt: new Date().toISOString()
                };
                
                const $title = $(el).find(site.selectors.title).first();
                if ($title.length) {
                    const text = $title.text().trim() || $title.attr('title');
                    const href = $title.attr('href') || $title.find('a').attr('href');
                    if (text && text.length > 10 && !text.toLowerCase().includes('javascript')) {
                        property.title = text.substring(0, 200);
                        if (href && href !== '#' && !href.startsWith('javascript')) {
                            property.link = href.startsWith('http') ? href : site.baseUrl + href;
                        }
                    }
                }
                
                const $price = $(el).find(site.selectors.price).first();
                if ($price.length) {
                    const text = $price.text().trim();
                    if (text && (text.includes('€') || text.match(/\d{3}\.\d{3}/) || text.match(/\d{6,}/))) {
                        property.price = text.substring(0, 50);
                    }
                }
                
                const $location = $(el).find(site.selectors.location).first();
                if ($location.length) {
                    const text = $location.text().trim();
                    if (text && text.length > 2 && text.length < 100 && !text.includes('€') && !text.match(/^\d+$/)) {
                        property.location = text.substring(0, 100);
                    }
                }
                
                const $area = $(el).find(site.selectors.area).first();
                if ($area.length) {
                    const text = $area.text().trim();
                    if (text && text.match(/\d+.*m[²2]/i)) {
                        property.area = text.substring(0, 20);
                    }
                }
                
                const $rooms = $(el).find(site.selectors.rooms).first();
                if ($rooms.length) {
                    const text = $rooms.text().trim();
                    if (text && (text.match(/t\d/i) || text.match(/\d.*quarto/i))) {
                        property.rooms = text.substring(0, 10);
                    }
                }
                
                if (property.title && property.title.length > 15) { // Relaxed criteria retained
                    properties.push(property);
                    console.log(`🔍 Encontrado: ${property.title.substring(0, 60)}... (Price: ${property.price}, Location: ${property.location})`);
                }
            });
            
            const filteredProperties = properties.filter(prop => isPropertyRelevant(prop, criteria));
            
            if (filteredProperties.length > 0) {
                console.log(`📊 ${site.name}: ${filteredProperties.length} imóveis encontrados`);
                await Dataset.pushData(filteredProperties.slice(0, 5));
            } else {
                console.log(`❌ ${site.name}: Nenhum imóvel encontrado`);
            }
        },
        failedRequestHandler: async ({ request, error }) => {
            console.log(`❌ Falha em ${request.userData.site.name}: ${error.message}`);
        },
    });
    
    console.log('\n🚀 Iniciando scraping...');
    await crawler.run();
    
    const dataset = await Dataset.open();
    const data = await dataset.getData();
    const totalProperties = data.items.length;
    
    console.log(`\n🎉 Scraping concluído!`);
    console.log(`📊 Total de imóveis encontrados: ${totalProperties}`);
    
    const bySite = {};
    data.items.forEach(item => {
        bySite[item.source] = (bySite[item.source] || 0) + 1;
    });
    
    console.log('\n📈 Resultados por site:');
    Object.entries(bySite).forEach(([site, count]) => {
        console.log(`  ${site}: ${count} imóveis`);
    });
    
    await Actor.exit();
};

function parseQuery(query) {
    const criteria = {
        location: '',
        rooms: '',
        area: '',
        condition: '',
        type: 'apartamento'
    };
    
    const queryLower = query.toLowerCase();
    
    const roomsMatch = queryLower.match(/t(\d+)/);
    if (roomsMatch) {
        criteria.rooms = `T${roomsMatch[1]}`;
    }
    
    const areaMatch = queryLower.match(/(\d+)\s*m[2²]?/);
    if (areaMatch) {
        criteria.area = parseInt(areaMatch[1]);
    }
    
    const locations = [
        'lisboa', 'porto', 'cascais', 'sintra', 'almada', 'amadora',
        'oeiras', 'loures', 'odivelas', 'vila nova de gaia', 'matosinhos',
        'braga', 'coimbra', 'aveiro', 'setúbal', 'évora', 'faro',
        'funchal', 'viseu', 'leiria', 'santarém', 'beja', 'castelo branco',
        'guarda', 'portalegre', 'vila real', 'bragança', 'viana do castelo'
    ];
    
    for (const loc of locations) {
        if (queryLower.includes(loc)) {
            criteria.location = loc;
            break;
        }
    }
    
    const conditions = ['novo', 'renovado', 'para renovar', 'usado', 'recente'];
    for (const cond of conditions) {
        if (queryLower.includes(cond)) {
            criteria.condition = cond;
            break;
        }
    }
    
    if (queryLower.includes('moradia') || queryLower.includes('casa')) {
        criteria.type = 'moradia';
    } else if (queryLower.includes('apartamento') || queryLower.includes('apto')) {
        criteria.type = 'apartamento';
    }
    
    return criteria;
}

function isPropertyRelevant(property, criteria) {
    if (!criteria.location && !criteria.rooms && !criteria.area) {
        return true;
    }
    
    let relevantCount = 0;
    let totalCriteria = 0;
    
    if (criteria.location) {
        totalCriteria++;
        const propLocation = property.location.toLowerCase();
        const propTitle = property.title.toLowerCase();
        if (propLocation.includes(criteria.location) || propTitle.includes(criteria.location)) {
            relevantCount++;
        }
    }
    
    if (criteria.rooms) {
        totalCriteria++;
        const propRooms = property.rooms.toLowerCase();
        const propTitle = property.title.toLowerCase();
        const criteriaRooms = criteria.rooms.toLowerCase();
        if (propRooms.includes(criteriaRooms) || propTitle.includes(criteriaRooms)) {
            relevantCount++;
        }
    }
    
    if (criteria.area) {
        totalCriteria++;
        const areaMatch = property.area.match(/(\d+)/);
        const titleAreaMatch = property.title.match(/(\d+)\s*m[2²]/i);
        
        if (areaMatch || titleAreaMatch) {
            const propArea = parseInt(areaMatch?.[1] || titleAreaMatch?.[1]);
            if (propArea && Math.abs(propArea - criteria.area) <= 30) {
                relevantCount++;
            }
        }
    }
    
    return totalCriteria === 0 || (relevantCount / totalCriteria) >= 0.5;
}

main().catch(console.error);
