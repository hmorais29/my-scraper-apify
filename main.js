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
            const locationSlug = criteria.location.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/ã/g, 'a')
                .replace(/õ/g, 'o')
                .replace(/á/g, 'a')
                .replace(/é/g, 'e')
                .replace(/í/g, 'i')
                .replace(/ó/g, 'o')
                .replace(/ú/g, 'u')
                .replace(/ç/g, 'c');
            url += `/${locationSlug}`;
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
            const locationSlug = criteria.location.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/ã/g, 'a')
                .replace(/õ/g, 'o')
                .replace(/á/g, 'a')
                .replace(/é/g, 'e')
                .replace(/í/g, 'i')
                .replace(/ó/g, 'o')
                .replace(/ú/g, 'u')
                .replace(/ç/g, 'c');
            url += `/${locationSlug}`;
        }
        
        return url;
    }

    function buildIdealistaUrl(criteria) {
        let url = 'https://www.idealista.pt/comprar-casas';
        
        if (criteria.location) {
            const locationSlug = criteria.location.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/ã/g, 'a')
                .replace(/õ/g, 'o')
                .replace(/á/g, 'a')
                .replace(/é/g, 'e')
                .replace(/í/g, 'i')
                .replace(/ó/g, 'o')
                .replace(/ú/g, 'u')
                .replace(/ç/g, 'c');
            url += `/${locationSlug}`;
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
                // Seletores atualizados baseados na estrutura mais recente
                container: 'article[data-cy="listing-item"], .offer-item-wrap, [data-cy="listing-item-wrap"], .css-1sw7q4x',
                title: 'h3[data-cy="listing-item-link"] a, .offer-item-title a, [data-cy="listing-item-title"], a[data-cy="listing-item-link"]',
                price: '[data-cy="listing-item-price"], .offer-item-price, [class*="price"], .css-1uwck7i',
                location: '[data-cy="listing-item-location"], .offer-item-location, [class*="location"], .css-12h460f',
                area: '.offer-item-area, [data-cy="listing-item-area"], [class*="area"], .css-1wi9dc7',
                rooms: '.offer-item-rooms, [data-cy="listing-item-rooms"], [class*="rooms"], .css-1wi9dc7'
            }
        },
        {
            name: 'ERA Portugal',
            baseUrl: 'https://www.era.pt',
            buildSearchUrl: buildEraUrl,
            selectors: {
                container: '.property-card, .listing-card, .property-item, .card, .property-wrap',
                title: '.property-title a, h2 a, h3 a, .card-title a, .property-link',
                price: '.property-price, .price, .valor, .card-price, .property-value',
                location: '.property-location, .location, .address, .card-location, .property-address',
                area: '.property-area, .area, .metros, .card-area, [data-area]',
                rooms: '.property-rooms, .tipologia, .quartos, .card-rooms, .property-type'
            }
        },
        {
            name: 'Idealista Portugal',
            baseUrl: 'https://www.idealista.pt',
            buildSearchUrl: buildIdealistaUrl,
            selectors: {
                // Seletores atualizados baseados na documentação encontrada
                container: '.item, .item-info-container, .property-card, [class*="item"]',
                title: '.item-link, a.item-link, h2 a, h3 a, [class*="title"] a',
                price: '.price-row .item-price, .item-price, [class*="price"], .listing-price',
                location: '.item-detail-location, .location, [class*="location"], .listing-address',
                area: '.item-detail-area, .area, [class*="area"], .listing-area, [class*="surface"]',
                rooms: '.item-detail, [class*="bedroom"], .tipologia, [class*="rooms"]'
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
                    userData: { site, criteria: searchCriteria },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1'
                    }
                });
            }
        } catch (error) {
            console.log(`❌ Erro ao construir URL para ${site.name}:`, error.message);
        }
    }
    
    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestRetries: 2,
        maxConcurrency: 1,
        maxRequestsPerMinute: 1,
        requestHandlerTimeoutSecs: 60,
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
            
            // Debug: mostrar quantos containers encontrámos
            const containers = $(site.selectors.container);
            console.log(`🔍 ${site.name}: Encontrados ${containers.length} containers`);
            
            containers.each((i, el) => {
                if (i >= 10) return; // Limitar a 10 resultados por site
                
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
                
                // Extrair título
                const titleSelectors = site.selectors.title.split(', ');
                for (const selector of titleSelectors) {
                    const $title = $(el).find(selector.trim()).first();
                    if ($title.length) {
                        const text = $title.text().trim() || $title.attr('title') || $title.attr('aria-label');
                        const href = $title.attr('href') || $title.closest('a').attr('href');
                        if (text && text.length > 10 && !text.toLowerCase().includes('javascript')) {
                            property.title = text.substring(0, 200);
                            if (href && href !== '#' && !href.startsWith('javascript')) {
                                property.link = href.startsWith('http') ? href : site.baseUrl + href;
                            }
                            break;
                        }
                    }
                }
                
                // Extrair preço
                const priceSelectors = site.selectors.price.split(', ');
                for (const selector of priceSelectors) {
                    const $price = $(el).find(selector.trim()).first();
                    if ($price.length) {
                        const text = $price.text().trim();
                        if (text && (text.includes('€') || text.match(/\d{3}[\.\s]\d{3}/) || text.match(/\d{6,}/))) {
                            property.price = text.substring(0, 50).replace(/\s+/g, ' ');
                            break;
                        }
                    }
                }
                
                // Extrair localização
                const locationSelectors = site.selectors.location.split(', ');
                for (const selector of locationSelectors) {
                    const $location = $(el).find(selector.trim()).first();
                    if ($location.length) {
                        const text = $location.text().trim();
                        if (text && text.length > 2 && text.length < 100 && !text.includes('€') && !text.match(/^\d+$/)) {
                            property.location = text.substring(0, 100);
                            break;
                        }
                    }
                }
                
                // Extrair área
                const areaSelectors = site.selectors.area.split(', ');
                for (const selector of areaSelectors) {
                    const $area = $(el).find(selector.trim()).first();
                    if ($area.length) {
                        const text = $area.text().trim();
                        if (text && text.match(/\d+.*m[²2]/i)) {
                            property.area = text.substring(0, 20).replace(/\s+/g, ' ');
                            break;
                        }
                    }
                }
                
                // Extrair quartos/tipologia
                const roomsSelectors = site.selectors.rooms.split(', ');
                for (const selector of roomsSelectors) {
                    const $rooms = $(el).find(selector.trim()).first();
                    if ($rooms.length) {
                        const text = $rooms.text().trim();
                        if (text && (text.match(/t\d/i) || text.match(/\d.*quarto/i) || text.match(/\d\s*assoalhada/i))) {
                            property.rooms = text.substring(0, 20).replace(/\s+/g, ' ');
                            break;
                        }
                    }
                }
                
                // Verificar se temos dados mínimos
                if (property.title && property.title.length > 15) {
                    properties.push(property);
                    console.log(`🏘️ ${property.title.substring(0, 60)}...`);
                    console.log(`   💰 Preço: ${property.price || 'N/A'}`);
                    console.log(`   📍 Local: ${property.location || 'N/A'}`);
                    console.log(`   📐 Área: ${property.area || 'N/A'}`);
                    console.log(`   🏠 Quartos: ${property.rooms || 'N/A'}`);
                }
            });
            
            const filteredProperties = properties.filter(prop => isPropertyRelevant(prop, criteria));
            
            if (filteredProperties.length > 0) {
                console.log(`📊 ${site.name}: ${filteredProperties.length} imóveis relevantes encontrados`);
                await Dataset.pushData(filteredProperties.slice(0, 8));
            } else {
                console.log(`❌ ${site.name}: Nenhum imóvel relevante encontrado`);
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
    
    const queryLower = query.toLowerCase()
        .replace(/ã/g, 'a')
        .replace(/õ/g, 'o')
        .replace(/á/g, 'a')
        .replace(/é/g, 'e')
        .replace(/í/g, 'i')
        .replace(/ó/g, 'o')
        .replace(/ú/g, 'u')
        .replace(/ç/g, 'c');
    
    // Extrair tipologia
    const roomsMatch = queryLower.match(/t(\d+)/);
    if (roomsMatch) {
        criteria.rooms = `T${roomsMatch[1]}`;
    }
    
    // Extrair área
    const areaMatch = queryLower.match(/(\d+)\s*m[2²]?/);
    if (areaMatch) {
        criteria.area = parseInt(areaMatch[1]);
    }
    
    // Lista mais completa de localizações portuguesas
    const locations = [
        // Distritos principais
        'lisboa', 'porto', 'braga', 'coimbra', 'aveiro', 'setubal', 'evora', 'faro',
        'funchal', 'viseu', 'leiria', 'santarem', 'beja', 'castelo branco',
        'guarda', 'portalegre', 'vila real', 'braganca', 'viana do castelo',
        // Concelhos importantes
        'cascais', 'sintra', 'almada', 'amadora', 'oeiras', 'loures', 'odivelas',
        'vila nova de gaia', 'matosinhos', 'gondomar', 'maia', 'povoa de varzim',
        'caldas da rainha', 'torres vedras', 'sesimbra', 'palmela', 'montijo',
        'barreiro', 'vila franca de xira', 'mafra', 'alcochete', 'sines',
        'lagos', 'portimao', 'tavira', 'olhao', 'silves', 'monchique',
        // Outras localizações
        'estoril', 'carcavelos', 'parede', 'sao joao do estoril', 'monte estoril',
        'queluz', 'barcarena', 'linda a velha', 'cruz quebrada', 'dafundo',
        'pontinha', 'falagueira', 'venda nova', 'encosta do sol', 'quinta do conde',
        'corroios', 'seixal', 'fernao ferro', 'caparica', 'trafaria'
    ];
    
    // Procurar localização na query
    for (const loc of locations) {
        if (queryLower.includes(loc)) {
            criteria.location = loc;
            break;
        }
    }
    
    // Extrair condição
    const conditions = ['novo', 'renovado', 'para renovar', 'usado', 'recente', 'seminovo'];
    for (const cond of conditions) {
        if (queryLower.includes(cond)) {
            criteria.condition = cond;
            break;
        }
    }
    
    // Extrair tipo de imóvel
    if (queryLower.includes('moradia') || queryLower.includes('casa') || queryLower.includes('vivenda')) {
        criteria.type = 'moradia';
    } else if (queryLower.includes('apartamento') || queryLower.includes('apto') || queryLower.includes('t0') || queryLower.includes('t1') || queryLower.includes('t2') || queryLower.includes('t3') || queryLower.includes('t4') || queryLower.includes('t5')) {
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
    
    // Verificar localização
    if (criteria.location) {
        totalCriteria++;
        const propLocation = property.location.toLowerCase().replace(/[áàãâ]/g, 'a').replace(/[éê]/g, 'e').replace(/[íî]/g, 'i').replace(/[óôõ]/g, 'o').replace(/[úü]/g, 'u').replace(/ç/g, 'c');
        const propTitle = property.title.toLowerCase().replace(/[áàãâ]/g, 'a').replace(/[éê]/g, 'e').replace(/[íî]/g, 'i').replace(/[óôõ]/g, 'o').replace(/[úü]/g, 'u').replace(/ç/g, 'c');
        const searchLocation = criteria.location.toLowerCase();
        
        if (propLocation.includes(searchLocation) || propTitle.includes(searchLocation)) {
            relevantCount++;
        }
    }
    
    // Verificar quartos
    if (criteria.rooms) {
        totalCriteria++;
        const propRooms = property.rooms.toLowerCase();
        const propTitle = property.title.toLowerCase();
        const criteriaRooms = criteria.rooms.toLowerCase();
        
        if (propRooms.includes(criteriaRooms) || propTitle.includes(criteriaRooms)) {
            relevantCount++;
        }
    }
    
    // Verificar área
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
    
    // Retornar verdadeiro se pelo menos 50% dos critérios coincidirem
    return totalCriteria === 0 || (relevantCount / totalCriteria) >= 0.5;
}

main().catch(console.error);
