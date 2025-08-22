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
                // Seletores mais genéricos baseados no que sabemos que funciona
                container: 'article, div[data-cy*="listing"], div[class*="offer"], div[class*="property"], div[class*="item"], li[class*="result"]',
                title: 'a[title], h1 a, h2 a, h3 a, h4 a, a[class*="title"], a[class*="link"], [data-cy*="link"] a',
                price: '*[class*="price"], *[data-cy*="price"], span:contains("€"), div:contains("€")',
                location: '*[class*="location"], *[class*="address"], *[data-cy*="location"], span[class*="place"]',
                area: '*[class*="area"], *[class*="surface"], *:contains("m²"), *:contains("m2")',
                rooms: '*[class*="room"], *[class*="bed"], *:contains("T1"), *:contains("T2"), *:contains("T3"), *:contains("T4"), *:contains("T5")'
            }
        },
        {
            name: 'ERA Portugal',
            baseUrl: 'https://www.era.pt',
            buildSearchUrl: buildEraUrl,
            selectors: {
                // Seletores específicos para imóveis, não navegação
                container: 'div[class*="property"], div[class*="listing"], div[class*="imovel"], div[class*="resultado"], .property-card, .property-item',
                title: 'a[href*="/imovel/"], a[href*="/propriedade/"], h3 a, h2 a, .property-title a',
                price: '*[class*="price"], *[class*="valor"], span:contains("€"), div:contains("€")',
                location: '*[class*="location"], *[class*="address"], *[class*="local"], span[class*="place"]',
                area: '*[class*="area"], *[class*="surface"], *:contains("m²"), *:contains("m2")',
                rooms: '*[class*="room"], *[class*="quarto"], *[class*="tipologia"], *:contains("T1"), *:contains("T2"), *:contains("T3"), *:contains("T4")'
            }
        },
        // {
        //     name: 'Idealista Portugal',
        //     baseUrl: 'https://www.idealista.pt',
        //     buildSearchUrl: buildIdealistaUrl,
        //     selectors: {
        //         container: 'div[class*="item"], article, div[class*="property"], div[class*="listing"]',
        //         title: 'a[class*="item-link"], a[title], h1 a, h2 a, h3 a, a[class*="title"]',
        //         price: '*[class*="price"], span:contains("€"), div:contains("€")',
        //         location: '*[class*="location"], *[class*="address"], *[class*="zone"]',
        //         area: '*[class*="area"], *[class*="surface"], *:contains("m²"), *:contains("m2")',
        //         rooms: '*[class*="room"], *[class*="bed"], *:contains("T1"), *:contains("T2"), *:contains("T3"), *:contains("T4")'
        //     }
        // }
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
        preNavigationHooks: [
            async ({ request }) => {
                // Adicionar delay extra para Idealista
                if (request.url.includes('idealista.pt')) {
                    console.log('⏳ Aguardando 5 segundos extra para Idealista...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        ],
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
            
            // Debug mais detalhado
            console.log(`📄 Tamanho da página: ${$.html().length} caracteres`);
            console.log(`🔍 A procurar containers com: ${site.selectors.container}`);
            
            const properties = [];
            
            // Testar cada seletor de container separadamente
            const containerSelectors = site.selectors.container.split(', ');
            let containers = $();
            
            for (const selector of containerSelectors) {
                const found = $(selector.trim());
                console.log(`   - "${selector.trim()}": ${found.length} elementos`);
                if (found.length > 0) {
                    containers = found;
                    break;
                }
            }
            
            console.log(`🔍 ${site.name}: Total containers encontrados: ${containers.length}`);
            
            // Se não encontrou containers, vamos fazer debug genérico
            if (containers.length === 0) {
                console.log('🔍 Fazendo debug genérico...');
                const commonSelectors = ['article', 'div[class*="item"]', 'div[class*="property"]', 'div[class*="listing"]', 'li'];
                for (const selector of commonSelectors) {
                    const found = $(selector);
                    if (found.length > 0) {
                        console.log(`   Encontrado ${found.length} elementos com "${selector}"`);
                        // Mostrar algumas classes dos primeiros elementos
                        found.slice(0, 3).each((i, el) => {
                            const classes = $(el).attr('class') || 'sem classes';
                            console.log(`      Elemento ${i}: ${classes}`);
                        });
                    }
                }
            }
            
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
                
                const $el = $(el);
                
                // Extrair título - abordagem mais específica para ImóVirtual
                let titleFound = false;
                
                // Para ImóVirtual, tentar seletores mais específicos primeiro
                if (site.name === 'Imovirtual') {
                    const specificSelectors = [
                        'h3 a[href*="/anuncio/"]',
                        'a[href*="/anuncio/"]',
                        'h3 a',
                        'h2 a',
                        'a[title]'
                    ];
                    
                    for (const selector of specificSelectors) {
                        if (titleFound) break;
                        const $title = $el.find(selector).first();
                        if ($title.length) {
                            const text = $title.attr('title') || $title.text().trim();
                            const href = $title.attr('href');
                            if (text && text.length > 10 && !text.includes('css-') && !text.includes('{') && href) {
                                property.title = text.substring(0, 200);
                                property.link = href.startsWith('http') ? href : site.baseUrl + href;
                                titleFound = true;
                                break;
                            }
                        }
                    }
                }
                
                // Fallback para outros seletores se não encontrou título específico
                if (!titleFound) {
                    const titleSelectors = site.selectors.title.split(', ');
                    for (const selector of titleSelectors) {
                        if (titleFound) break;
                        const elements = $el.find(selector.trim());
                        elements.each((idx, titleEl) => {
                            if (titleFound) return;
                            const $titleEl = $(titleEl);
                            const text = $titleEl.attr('title') || $titleEl.text().trim() || $titleEl.attr('aria-label');
                            if (text && text.length > 10 && !text.includes('css-') && !text.includes('{') && !text.toLowerCase().includes('javascript')) {
                                property.title = text.substring(0, 200);
                                const href = $titleEl.attr('href') || $titleEl.closest('a').attr('href');
                                if (href && href !== '#' && !href.startsWith('javascript')) {
                                    property.link = href.startsWith('http') ? href : site.baseUrl + href;
                                }
                                titleFound = true;
                            }
                        });
                    }
                }
                
                // Se não encontrou título, procurar qualquer link
                if (!titleFound) {
                    const anyLink = $el.find('a').first();
                    if (anyLink.length) {
                        const text = anyLink.text().trim();
                        if (text && text.length > 5) {
                            property.title = text.substring(0, 200);
                            const href = anyLink.attr('href');
                            if (href && href !== '#') {
                                property.link = href.startsWith('http') ? href : site.baseUrl + href;
                            }
                        }
                    }
                }
                
                // Extrair preço - procurar por texto com €
                const allText = $el.text();
                const priceMatch = allText.match(/(\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?\s*€)/);
                if (priceMatch) {
                    property.price = priceMatch[1];
                }
                
                // Extrair área - melhorar regex para capturar decimais
                const areaMatch = allText.match(/(\d+(?:[,\.]\d+)?\s*m[²2])/i);
                if (areaMatch) {
                    property.area = areaMatch[1];
                }
                
                // Extrair quartos - melhorar regex e procurar em locais específicos
                let roomsMatch = allText.match(/(T[0-9]+)/i);
                if (roomsMatch) {
                    property.rooms = roomsMatch[1].toUpperCase();
                } else {
                    // Procurar padrões alternativos como "2 quartos", "3 assoalhadas"
                    const altRoomsMatch = allText.match(/(\d+)\s*(?:quartos?|assoalhadas?)/i);
                    if (altRoomsMatch) {
                        property.rooms = `T${altRoomsMatch[1]}`;
                    }
                }
                
                // Tentar extrair localização do texto geral
                if (!property.location) {
                    // Procurar por nomes de cidades conhecidas no texto
                    const locations = ['lisboa', 'porto', 'cascais', 'sintra', 'caldas da rainha', 'coimbra', 'braga'];
                    for (const loc of locations) {
                        if (allText.toLowerCase().includes(loc)) {
                            property.location = loc;
                            break;
                        }
                    }
                }
                
                // Debug individual do imóvel
                if (i < 3) { // Mostrar debug apenas dos primeiros 3
                    console.log(`🏘️ Debug imóvel ${i + 1}:`);
                    console.log(`   📝 Título: "${property.title}"`);
                    console.log(`   💰 Preço: "${property.price}"`);
                    console.log(`   📍 Local: "${property.location}"`);
                    console.log(`   📐 Área: "${property.area}"`);
                    console.log(`   🏠 Quartos: "${property.rooms}"`);
                    console.log(`   🔗 Link: "${property.link}"`);
                }
                
                // Verificar se temos dados mínimos e válidos
                const isValidProperty = (
                    property.title && 
                    property.title.length > 15 && 
                    !property.title.includes('css-') &&
                    !property.title.includes('{') &&
                    (property.price || property.link) // Pelo menos preço OU link
                );
                
                if (isValidProperty) {
                    properties.push(property);
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
