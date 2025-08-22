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

    const propertySites = [
        {
            name: 'Imovirtual',
            baseUrl: 'https://www.imovirtual.com',
            buildSearchUrl: buildImovirtualUrl
        },
        {
            name: 'ERA Portugal',
            baseUrl: 'https://www.era.pt',
            buildSearchUrl: buildEraUrl
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
            
            if (response.statusCode !== 200) {
                console.log(`❌ ${site.name} - Status: ${response.statusCode}`);
                return;
            }
            
            console.log(`✅ ${site.name} acessível!`);
            console.log(`📄 Tamanho da página: ${$.html().length} caracteres`);
            
            if (site.name === 'Imovirtual') {
                await debugImovirtualStructure($, criteria);
            } else {
                await debugERAStructure($, criteria);
            }
        },
        failedRequestHandler: async ({ request, error }) => {
            console.log(`❌ Falha em ${request.userData.site.name}: ${error.message}`);
        },
    });
    
    console.log('\n🚀 Iniciando scraping...');
    await crawler.run();
    
    console.log(`\n🎉 Debug concluído!`);
    await Actor.exit();
};

// FUNÇÃO DE DEBUG DETALHADO PARA IMOVIRTUAL
async function debugImovirtualStructure($, criteria) {
    console.log('\n🔍 === DEBUG DETALHADO IMOVIRTUAL ===');
    
    // Testar vários seletores de container
    const containerTests = [
        'article[data-cy="search.listing.organic"]',
        'article[data-testid="listing-organic"]',
        'article',
        'div[class*="offer"]',
        'div[class*="listing"]',
        'li[class*="offer"]'
    ];
    
    let bestContainer = null;
    let bestCount = 0;
    
    for (const selector of containerTests) {
        const found = $(selector);
        console.log(`🔍 Teste container "${selector}": ${found.length} elementos`);
        
        if (found.length > bestCount) {
            bestCount = found.length;
            bestContainer = selector;
        }
    }
    
    if (!bestContainer || bestCount === 0) {
        console.log('❌ Nenhum container encontrado!');
        return;
    }
    
    console.log(`\n✅ Melhor container: "${bestContainer}" com ${bestCount} elementos`);
    
    // Analisar os primeiros 3 elementos
    const containers = $(bestContainer);
    
    for (let i = 0; i < Math.min(3, containers.length); i++) {
        const $el = $(containers[i]);
        
        console.log(`\n🏘️ === ANÁLISE DETALHADA DO IMÓVEL ${i + 1} ===`);
        
        // 1. ESTRUTURA GERAL
        console.log('📐 Estrutura do elemento:');
        console.log(`   - Classe principal: ${$el.attr('class') || 'N/A'}`);
        console.log(`   - Data attributes: ${Object.keys($el.get(0).attribs || {}).filter(k => k.startsWith('data-')).join(', ') || 'N/A'}`);
        
        // 2. ANÁLISE DE LINKS
        console.log('\n🔗 Links encontrados:');
        const links = $el.find('a');
        links.each((j, link) => {
            const $link = $(link);
            const href = $link.attr('href');
            const text = $link.text().trim();
            if (href && href !== '#' && text.length > 0) {
                console.log(`   Link ${j + 1}: "${text.substring(0, 50)}" → ${href.substring(0, 50)}`);
            }
        });
        
        // 3. ANÁLISE DE TEXTOS COM NÚMEROS
        console.log('\n🔢 Textos com números/símbolos relevantes:');
        const allText = $el.text();
        
        // Procurar preços
        const priceMatches = allText.match(/\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?\s*€/g);
        if (priceMatches) {
            console.log(`   💰 Preços encontrados: ${priceMatches.join(', ')}`);
        }
        
        // Procurar áreas
        const areaMatches = allText.match(/\d+(?:[,\.]\d+)?\s*m[²2]/gi);
        if (areaMatches) {
            console.log(`   📐 Áreas encontradas: ${areaMatches.join(', ')}`);
        }
        
        // Procurar quartos/tipologias
        const roomMatches = allText.match(/T[0-6]|\d+\s*quarto[s]?/gi);
        if (roomMatches) {
            console.log(`   🏠 Quartos encontrados: ${roomMatches.join(', ')}`);
        }
        
        // 4. ANÁLISE DE ELEMENTOS FILHOS ESPECÍFICOS
        console.log('\n🎯 Elementos filhos relevantes:');
        
        // Procurar por spans/divs que contenham dados específicos
        $el.find('span, div').each((j, child) => {
            const $child = $(child);
            const text = $child.text().trim();
            const classes = $child.attr('class') || '';
            const dataAttrs = Object.keys($child.get(0).attribs || {}).filter(k => k.startsWith('data-'));
            
            // Só mostrar elementos com dados úteis
            if ((text.includes('€') || text.includes('m²') || text.includes('T') || text.includes('quarto')) && text.length < 50) {
                console.log(`   - "${text}" [classe: ${classes.substring(0, 30)}] [data: ${dataAttrs.join(',')}]`);
            }
        });
        
        // 5. TENTAR EXTRAIR DADOS COM DIFERENTES ESTRATÉGIAS
        console.log('\n🎯 TESTE DE EXTRAÇÃO:');
        
        // Estratégia 1: Por posição/ordem dos elementos
        const spanElements = $el.find('span').toArray();
        console.log(`   📊 Total de spans: ${spanElements.length}`);
        
        spanElements.forEach((span, idx) => {
            const text = $(span).text().trim();
            if (text && text.length < 100 && (text.includes('€') || text.includes('m²') || text.includes('T') || text.includes('quarto'))) {
                console.log(`   Span[${idx}]: "${text}"`);
            }
        });
        
        // Estratégia 2: Por estrutura hierárquica
        console.log('\n   🌳 Estrutura hierárquica:');
        $el.children().each((idx, child) => {
            const $child = $(child);
            const tag = child.tagName.toLowerCase();
            const text = $child.text().trim();
            if (text.length > 0 && text.length < 200) {
                console.log(`   ${tag}[${idx}]: "${text.substring(0, 100)}"`);
            }
        });
        
        console.log('\n' + '='.repeat(50));
    }
    
    // 6. SUGESTÕES DE SELETORES
    console.log('\n💡 SUGESTÕES DE SELETORES BASEADO NA ANÁLISE:');
    
    // Procurar padrões comuns
    const firstElement = $(containers[0]);
    
    // Testar seletores data-*
    const dataSelectors = [];
    firstElement.find('*[data-cy], *[data-testid], *[data-qa]').each((i, el) => {
        const $el = $(el);
        ['data-cy', 'data-testid', 'data-qa'].forEach(attr => {
            const value = $el.attr(attr);
            if (value) {
                dataSelectors.push(`[${attr}="${value}"]`);
            }
        });
    });
    
    if (dataSelectors.length > 0) {
        console.log('   🎯 Seletores data-* encontrados:');
        dataSelectors.slice(0, 10).forEach(sel => {
            console.log(`      ${sel}`);
        });
    }
    
    console.log('\n✅ Debug ImóVirtual concluído!');
}

// FUNÇÃO DE DEBUG PARA ERA
async function debugERAStructure($, criteria) {
    console.log('\n🔍 === DEBUG DETALHADO ERA PORTUGAL ===');
    
    const containerTests = [
        'div[class*="property"]',
        'div[class*="listing"]', 
        'div[class*="imovel"]',
        'article',
        '.property-card',
        '.listing-item'
    ];
    
    for (const selector of containerTests) {
        const found = $(selector);
        console.log(`🔍 Teste container "${selector}": ${found.length} elementos`);
    }
    
    // Procurar por qualquer elemento que contenha dados de imóveis
    console.log('\n🔍 Procurando elementos com dados de imóveis...');
    
    const elementsWithPrice = $('*:contains("€")').length;
    const elementsWithArea = $('*:contains("m²")').length;
    const elementsWithRooms = $('*:contains("T1"), *:contains("T2"), *:contains("T3"), *:contains("T4")').length;
    
    console.log(`   💰 Elementos com preços (€): ${elementsWithPrice}`);
    console.log(`   📐 Elementos com áreas (m²): ${elementsWithArea}`);
    console.log(`   🏠 Elementos com tipologias (T1-T4): ${elementsWithRooms}`);
    
    if (elementsWithPrice > 0 || elementsWithArea > 0 || elementsWithRooms > 0) {
        console.log('\n🎯 ERA tem dados de imóveis, mas os containers não estão sendo detectados!');
        
        // Mostrar alguns elementos que contêm dados
        $('*:contains("€")').slice(0, 5).each((i, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            const tag = el.tagName.toLowerCase();
            const classes = $el.attr('class') || '';
            if (text.length < 100) {
                console.log(`   💰 ${tag}.${classes}: "${text}"`);
            }
        });
    } else {
        console.log('❌ ERA não tem dados de imóveis detectáveis ou página diferente do esperado');
    }
    
    console.log('\n✅ Debug ERA concluído!');
}

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
    
    // Lista de localizações
    const locations = [
        'lisboa', 'porto', 'braga', 'coimbra', 'aveiro', 'setubal', 'evora', 'faro',
        'funchal', 'viseu', 'leiria', 'santarem', 'beja', 'castelo branco',
        'guarda', 'portalegre', 'vila real', 'braganca', 'viana do castelo',
        'cascais', 'sintra', 'almada', 'amadora', 'oeiras', 'loures', 'odivelas',
        'vila nova de gaia', 'matosinhos', 'gondomar', 'maia', 'povoa de varzim',
        'caldas da rainha', 'torres vedras', 'sesimbra', 'palmela', 'montijo',
        'barreiro', 'vila franca de xira', 'mafra', 'alcochete', 'sines',
        'lagos', 'portimao', 'tavira', 'olhao', 'silves', 'monchique'
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

main().catch(console.error);
