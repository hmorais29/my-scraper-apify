import { Actor } from 'apify';
import { CheerioCrawler, log } from 'crawlee';

// Configuração inicial
await Actor.init();

// Função para extrair critérios da query
function extractCriteria(query) {
    const criteria = {
        location: '',
        rooms: '',
        area: '',
        condition: '',
        type: 'apartamento'
    };
    
    const lowerQuery = query.toLowerCase();
    
    // Localização
    const locationPatterns = [
        /caldas da rainha/i,
        /lisboa/i,
        /porto/i,
        /coimbra/i,
        /braga/i,
        /faro/i,
        /aveiro/i,
        /leiria/i
    ];
    
    for (const pattern of locationPatterns) {
        const match = query.match(pattern);
        if (match) {
            criteria.location = match[0].toLowerCase();
            break;
        }
    }
    
    // Tipologia
    const roomsMatch = query.match(/T(\d)/i);
    if (roomsMatch) {
        criteria.rooms = roomsMatch[0].toUpperCase();
    }
    
    // Estado
    if (lowerQuery.includes('novo')) criteria.condition = 'novo';
    if (lowerQuery.includes('usado')) criteria.condition = 'usado';
    if (lowerQuery.includes('renovado')) criteria.condition = 'renovado';
    
    return criteria;
}

// Função para construir URLs
function buildURLs(criteria) {
    const urls = [];
    
    // ImóVirtual
    let imovirtualURL = 'https://www.imovirtual.com/comprar/apartamento';
    if (criteria.location) {
        imovirtualURL += `/${criteria.location.replace(/\s+/g, '-')}`;
    }
    
    const imovirtualParams = [];
    if (criteria.rooms) {
        const roomNumber = criteria.rooms.replace('T', '');
        imovirtualParams.push(`search%255Bfilter_float_number_of_rooms%253Afrom%255D=${roomNumber}`);
        imovirtualParams.push(`search%255Bfilter_float_number_of_rooms%253Ato%255D=${roomNumber}`);
    }
    
    if (imovirtualParams.length > 0) {
        imovirtualURL += '?' + imovirtualParams.join('&');
    }
    
    urls.push({
        url: imovirtualURL,
        site: 'Imovirtual',
        handler: 'imovirtual'
    });
    
    // ERA Portugal
    let eraURL = 'https://www.era.pt/comprar/apartamentos';
    if (criteria.location) {
        eraURL += `/${criteria.location.replace(/\s+/g, '-')}`;
    }
    
    urls.push({
        url: eraURL,
        site: 'ERA Portugal',
        handler: 'era'
    });
    
    return urls;
}

// Função para limpar texto
function cleanText(text) {
    return text ? text.replace(/\s+/g, ' ').trim() : '';
}

// Função para extrair preço
function extractPrice(text) {
    if (!text) return null;
    const priceMatch = text.match(/([\d\s]+)\s*€/);
    if (priceMatch) {
        return parseInt(priceMatch[1].replace(/\s/g, ''));
    }
    return null;
}

// Função para extrair área
function extractArea(text) {
    if (!text) return null;
    const areaMatch = text.match(/([\d,\.]+)\s*m²/);
    if (areaMatch) {
        return parseFloat(areaMatch[1].replace(',', '.'));
    }
    return null;
}

// Handler para ImóVirtual (CORRIGIDO)
async function handleImovirtual($, url) {
    console.log('\n🏠 Processando Imovirtual...');
    
    const properties = [];
    
    // Usar o seletor descoberto no debug
    const listings = $('article.css-xv0nyo');
    console.log(`📊 Encontrados ${listings.length} imóveis`);
    
    listings.each((index, element) => {
        try {
            const $element = $(element);
            
            // Link do imóvel usando seletor data-cy descoberto
            const linkElement = $element.find('[data-cy="listing-item-link"]');
            const relativeUrl = linkElement.attr('href');
            const link = relativeUrl ? `https://www.imovirtual.com${relativeUrl}` : null;
            
            // Título usando seletor data-cy descoberto
            const title = cleanText($element.find('[data-cy="listing-item-title"]').text()) ||
                         cleanText(linkElement.attr('title')) ||
                         cleanText(linkElement.text());
            
            // Extrair dados dos spans na ordem descoberta
            const spans = $element.find('span');
            let price = null, area = null, rooms = null, pricePerSqm = null;
            
            spans.each((i, span) => {
                const text = $(span).text().trim();
                
                // Preço principal (formato: "229 500 €")
                if (text.match(/^\d[\d\s]*\s*€$/) && !price) {
                    price = extractPrice(text);
                }
                
                // Preço por m² (formato: "2120 €/m²")
                if (text.includes('€/m²') && !pricePerSqm) {
                    pricePerSqm = extractPrice(text);
                }
                
                // Tipologia (formato: "T3")
                if (text.match(/^T\d+$/) && !rooms) {
                    rooms = text;
                }
                
                // Área (formato: "108.28 m²")
                if (text.includes('m²') && !text.includes('€') && !area) {
                    area = extractArea(text);
                }
            });
            
            // Localização - extrair do título ou URL
            let location = '';
            if (title) {
                const locationMatch = title.match(/caldas da rainha|lisboa|porto|coimbra|braga|faro|aveiro|leiria/i);
                if (locationMatch) {
                    location = locationMatch[0];
                }
            }
            
            // Só adicionar se tiver dados essenciais
            if (title && price && link) {
                const property = {
                    title: title,
                    price: price,
                    area: area,
                    rooms: rooms,
                    location: location,
                    pricePerSqm: pricePerSqm,
                    link: link,
                    site: 'ImóVirtual'
                };
                
                properties.push(property);
                
                console.log(`✅ Imóvel ${index + 1}:`);
                console.log(`   📋 Título: ${title}`);
                console.log(`   💰 Preço: ${price ? price.toLocaleString() + ' €' : 'N/A'}`);
                console.log(`   📐 Área: ${area ? area + ' m²' : 'N/A'}`);
                console.log(`   🏠 Tipologia: ${rooms || 'N/A'}`);
                console.log(`   📍 Localização: ${location || 'N/A'}`);
                console.log(`   🔗 Link: ${link}`);
                console.log('');
            }
            
        } catch (error) {
            console.log(`❌ Erro ao processar imóvel ${index + 1}:`, error.message);
        }
    });
    
    console.log(`✅ ImóVirtual processado: ${properties.length} imóveis encontrados`);
    return properties;
}

// 🔧 Handler para ERA Portugal (VERSÃO CORRIGIDA E MELHORADA)
async function handleERA($, url) {
    console.log('\n🏠 Processando ERA Portugal...');
    
    const properties = [];
    
    // STEP 1: Verificar se o site requer JavaScript
    const bodyText = $('body').text();
    const htmlContent = $.html();
    
    console.log(`📄 Tamanho do HTML: ${htmlContent.length} caracteres`);
    console.log(`📝 Primeiros 200 caracteres do body: ${bodyText.substring(0, 200)}`);
    
    if (bodyText.includes('JavaScript disabled') || 
        bodyText.includes('enable JavaScript') || 
        bodyText.includes('please enable JavaScript') ||
        htmlContent.length < 1000) {
        console.log('⚠️  ERA requer JavaScript - tentando estratégias alternativas...');
        
        // Estratégia 1: Tentar encontrar dados em scripts JSON
        const scriptTags = $('script[type="application/json"], script:contains("window."), script:contains("data")');
        console.log(`📄 Encontrados ${scriptTags.length} scripts para análise`);
        
        let jsonDataFound = false;
        scriptTags.each((i, script) => {
            try {
                const scriptContent = $(script).html();
                if (scriptContent && scriptContent.includes('price') && scriptContent.includes('property')) {
                    console.log(`📄 Script ${i + 1} contém dados: ${scriptContent.substring(0, 100)}...`);
                    // Tentar extrair dados JSON
                    const jsonMatch = scriptContent.match(/\{.*"properties".*\}/);
                    if (jsonMatch) {
                        const data = JSON.parse(jsonMatch[0]);
                        console.log('✅ Dados JSON extraídos com sucesso');
                        jsonDataFound = true;
                        return false; // break
                    }
                }
            } catch (e) {
                // Script não é JSON válido, continuar
                console.log(`   Script ${i + 1} não é JSON válido`);
            }
        });
        
        if (!jsonDataFound) {
            console.log('🔄 Nenhum JSON útil encontrado, tentando abordagens alternativas...');
            return await tryAlternativeEraApproaches(url);
        }
    }
    
    // STEP 2: Site carregou HTML - tentar extrair dados
    console.log('✅ Conteúdo HTML disponível, procurando propriedades...');
    
    // Lista expandida de seletores baseados em padrões comuns de sites imobiliários
    const selectors = [
        // Seletores específicos ERA
        '.property-card',
        '.property-item', 
        '.listing-item',
        '.search-result-item',
        '.property-result',
        'div[class*="property"]',
        'div[class*="listing"]',
        'div[class*="imovel"]',
        
        // Seletores baseados em estrutura
        'article:has(.price), article:has([class*="price"])',
        'div:has(.price):has(.area)',
        'div:has([class*="euro"]):has([class*="metro"])',
        
        // Seletores genéricos para cards
        '.card:has(a[href*="imovel"])',
        '.item:has(a[href*="propriedade"])',
        'div:has(a[href*="apartamento"])',
        
        // Seletores por atributos data
        '[data-property-id]',
        '[data-listing-id]',
        '[data-testid*="property"]',
        
        // Último recurso - qualquer link para propriedades
        'a[href*="/imovel/"], a[href*="/propriedade/"], a[href*="/apartamento/"]'
    ];
    
    let bestMatch = { elements: $(), count: 0, selector: '' };
    
    // Testar cada seletor e encontrar o melhor
    for (const selector of selectors) {
        try {
            const elements = $(selector);
            let propertyCount = 0;
            
            // Verificar quantos elementos realmente contêm dados de propriedades
            elements.each((i, el) => {
                const text = $(el).text();
                const hasPrice = /\d+[\s\d]*\s*€/.test(text);
                const hasArea = /\d+[,.]?\d*\s*m²/.test(text);
                const hasRooms = /T\d/.test(text);
                
                if (hasPrice && (hasArea || hasRooms)) {
                    propertyCount++;
                }
            });
            
            console.log(`📊 Seletor "${selector}": ${elements.length} elementos, ${propertyCount} com dados de propriedades`);
            
            if (propertyCount > bestMatch.count) {
                bestMatch = {
                    elements: elements,
                    count: propertyCount, 
                    selector: selector
                };
            }
        } catch (e) {
            console.log(`❌ Erro com seletor "${selector}": ${e.message}`);
        }
    }
    
    console.log(`🎯 Melhor seletor: "${bestMatch.selector}" com ${bestMatch.count} propriedades`);
    
    // STEP 3: Se não encontrou nada, fazer busca agressiva
    if (bestMatch.count === 0) {
        console.log('🔍 Fazendo busca agressiva por elementos com preços...');
        return await aggressiveERASearch($);
    }
    
    // STEP 4: Processar elementos encontrados
    bestMatch.elements.each((index, element) => {
        try {
            const $element = $(element);
            const property = extractERAPropertyData($element, $);
            
            if (property.title && property.price) {
                property.site = 'ERA Portugal';
                properties.push(property);
                
                console.log(`✅ Imóvel ERA ${index + 1}:`);
                console.log(`   📋 Título: ${property.title}`);
                console.log(`   💰 Preço: ${property.price.toLocaleString()} €`);
                console.log(`   📐 Área: ${property.area ? property.area + ' m²' : 'N/A'}`);
                console.log(`   🏠 Tipologia: ${property.rooms || 'N/A'}`);
                console.log(`   📍 Localização: ${property.location || 'N/A'}`);
                console.log(`   🔗 Link: ${property.link || 'N/A'}`);
                console.log('');
            }
        } catch (error) {
            console.log(`❌ Erro ao processar imóvel ERA ${index + 1}:`, error.message);
        }
    });
    
    console.log(`✅ ERA Portugal processado: ${properties.length} imóveis encontrados`);
    return properties;
}

// Função auxiliar para extrair dados de propriedade ERA
function extractERAPropertyData($element, $global) {
    const elementText = $element.text();
    const elementHtml = $element.html();
    
    // Extrair preço
    const priceMatch = elementText.match(/([\d\s\.]+)\s*€/) || 
                      elementText.match(/€\s*([\d\s\.]+)/) ||
                      elementText.match(/([\d\s]+)\s*euros?/i);
    const price = priceMatch ? parseInt(priceMatch[1].replace(/[\s\.]/g, '')) : null;
    
    // Extrair área
    const areaMatch = elementText.match(/([\d,\.]+)\s*m²/) || 
                     elementText.match(/([\d,\.]+)\s*metros?/i);
    const area = areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : null;
    
    // Extrair tipologia
    const roomsMatch = elementText.match(/T(\d+)/i) || 
                      elementText.match(/(\d+)\s*quarto/i);
    const rooms = roomsMatch ? (roomsMatch[0].startsWith('T') ? roomsMatch[0] : `T${roomsMatch[1]}`) : null;
    
    // Extrair título
    let title = '';
    const titleSelectors = [
        'h1, h2, h3, h4',
        '.title, .titulo, .name',
        '[class*="title"], [class*="name"]',
        'a[href*="imovel"], a[href*="propriedade"]',
        'a'
    ];
    
    for (const selector of titleSelectors) {
        const titleEl = $element.find(selector).first();
        if (titleEl.length) {
            title = cleanText(titleEl.text()) || cleanText(titleEl.attr('title'));
            if (title && title.length > 5) break;
        }
    }
    
    // Se não encontrou título, criar um genérico
    if (!title) {
        title = rooms ? `Apartamento ${rooms}` : 'Apartamento';
        if (area) title += ` de ${area}m²`;
        title += ' - ERA Portugal';
    }
    
    // Extrair link
    const linkElement = $element.find('a').first();
    let link = linkElement.attr('href');
    if (link && !link.startsWith('http')) {
        link = link.startsWith('/') ? `https://www.era.pt${link}` : `https://www.era.pt/${link}`;
    }
    
    // Extrair localização (tentar do contexto ou URL)
    let location = '';
    const locationMatch = elementText.match(/caldas da rainha|lisboa|porto|coimbra|braga|faro|aveiro|leiria/gi);
    if (locationMatch) {
        location = locationMatch[0];
    } else if (link && link.includes('caldas')) {
        location = 'Caldas da Rainha';
    }
    
    return {
        title: title,
        price: price,
        area: area,
        rooms: rooms,
        location: location || 'N/A',
        link: link
    };
}

// Busca agressiva quando métodos normais falham
async function aggressiveERASearch($) {
    console.log('🚨 Iniciando busca agressiva na ERA...');
    
    const properties = [];
    
    // Encontrar todos os elementos que contêm "€"
    const priceElements = $('*').filter(function() {
        const text = $(this).text();
        return text.includes('€') && /\d/.test(text) && $(this).children().length < 5;
    });
    
    console.log(`💰 Encontrados ${priceElements.length} elementos com preços`);
    
    const processedParents = new Set();
    
    priceElements.each((i, el) => {
        const $el = $(el);
        let $parent = $el.parent();
        
        // Subir na hierarquia para encontrar o container da propriedade
        for (let level = 0; level < 5 && $parent.length; level++) {
            const parentId = $parent[0];
            
            if (processedParents.has(parentId)) {
                break;
            }
            
            const parentText = $parent.text();
            
            // Verificar se este elemento pai tem dados completos de propriedade
            const hasPrice = /\d+[\s\d]*\s*€/.test(parentText);
            const hasArea = /\d+[,.]?\d*\s*m²/.test(parentText);
            const hasRooms = /T\d/.test(parentText);
            const hasLink = $parent.find('a[href*="imovel"], a[href*="propriedade"], a[href*="apartamento"]').length > 0;
            
            if (hasPrice && (hasArea || hasRooms || hasLink)) {
                processedParents.add(parentId);
                
                const property = extractERAPropertyData($parent, $);
                
                if (property.title && property.price) {
                    property.site = 'ERA Portugal';
                    properties.push(property);
                    
                    console.log(`🎯 Propriedade encontrada agressivamente:`);
                    console.log(`   📋 ${property.title}`);
                    console.log(`   💰 ${property.price.toLocaleString()} €`);
                }
                
                break;
            }
            
            $parent = $parent.parent();
        }
    });
    
    // Remover duplicados baseado em título e preço
    const uniqueProperties = [];
    const seen = new Set();
    
    for (const prop of properties) {
        const key = `${prop.title}-${prop.price}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueProperties.push(prop);
        }
    }
    
    console.log(`🎯 Busca agressiva concluída: ${uniqueProperties.length} propriedades únicas`);
    return uniqueProperties;
}

// Estratégias alternativas quando JavaScript é necessário
async function tryAlternativeEraApproaches(url) {
    console.log('🔄 Tentando abordagens alternativas para ERA...');
    
    // Por enquanto, retornar array vazio
    // Aqui poderia implementar:
    // - Chamadas para APIs diretas
    // - Parsing de dados de scripts embebidos
    // - Uso de proxies ou serviços externos
    
    console.log('ℹ️  Alternativas não implementadas ainda - ERA requer JavaScript');
    console.log('💡 Sugestão: Considerar upgrade do Apify para usar Puppeteer ou Playwright');
    
    return [];
}

// Configuração principal
const input = await Actor.getInput();
const query = input?.query || 'Imóvel T4 caldas da Rainha novo';

console.log('🔥 Input recebido:', { query });
console.log(`🔍 Query: "${query}"`);

const criteria = extractCriteria(query);
console.log('📋 Critérios extraídos:', criteria);

const urls = buildURLs(criteria);

// Log das URLs
urls.forEach(urlObj => {
    console.log(`🌐 ${urlObj.site}: ${urlObj.url}`);
});

console.log('\n🚀 Iniciando scraping...');

const allProperties = [];

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 10,
    requestHandlerTimeoutSecs: 60,
    
    async requestHandler({ request, $, response }) {
        const url = request.url;
        const handler = request.userData.handler;
        
        console.log(`\n📊 Status: ${response.statusCode}`);
        
        if (response.statusCode !== 200) {
            console.log(`❌ Erro HTTP: ${response.statusCode}`);
            return;
        }
        
        console.log(`✅ ${request.userData.site} acessível!`);
        
        let properties = [];
        
        try {
            if (handler === 'imovirtual') {
                properties = await handleImovirtual($, url);
            } else if (handler === 'era') {
                properties = await handleERA($, url);
            }
            
            allProperties.push(...properties);
            
        } catch (error) {
            console.log(`❌ Erro ao processar ${request.userData.site}:`, error.message);
        }
    },
});

// Adicionar URLs à fila
for (const urlObj of urls) {
    await crawler.addRequests([{
        url: urlObj.url,
        userData: urlObj
    }]);
}

await crawler.run();

// Processar e filtrar resultados
console.log('\n📊 === RELATÓRIO FINAL ===');
console.log(`🏠 Total de imóveis encontrados: ${allProperties.length}`);

// Filtrar por critérios se especificados
let filteredProperties = allProperties;

if (criteria.rooms) {
    const beforeCount = filteredProperties.length;
    filteredProperties = filteredProperties.filter(p => p.rooms === criteria.rooms);
    console.log(`🔍 Filtro tipologia ${criteria.rooms}: ${beforeCount} → ${filteredProperties.length}`);
}

if (criteria.condition === 'novo') {
    const beforeCount = filteredProperties.length;
    filteredProperties = filteredProperties.filter(p => 
        p.title.toLowerCase().includes('novo') || 
        p.title.toLowerCase().includes('nova') ||
        p.title.toLowerCase().includes('novos')
    );
    console.log(`🔍 Filtro condição 'novo': ${beforeCount} → ${filteredProperties.length}`);
}

// Ordenar por preço
filteredProperties.sort((a, b) => (a.price || 0) - (b.price || 0));

console.log('\n🎯 === IMÓVEIS ENCONTRADOS ===');
filteredProperties.forEach((property, index) => {
    console.log(`\n${index + 1}. ${property.title}`);
    console.log(`   💰 Preço: ${property.price ? property.price.toLocaleString() + ' €' : 'N/A'}`);
    console.log(`   📐 Área: ${property.area ? property.area + ' m²' : 'N/A'}`);
    console.log(`   🏠 Tipologia: ${property.rooms || 'N/A'}`);
    console.log(`   📍 Local: ${property.location || 'N/A'}`);
    console.log(`   🌐 Site: ${property.site}`);
    console.log(`   🔗 Link: ${property.link || 'N/A'}`);
    
    if (property.pricePerSqm) {
        console.log(`   💵 Preço/m²: ${property.pricePerSqm} €/m²`);
    }
});

// MELHOR FORMATO DE OUTPUT - Salvar cada imóvel individualmente
const summary = {
    query: query,
    criteria: criteria,
    totalFound: allProperties.length,
    filteredCount: filteredProperties.length,
    searchUrls: urls.map(u => ({ site: u.site, url: u.url })),
    timestamp: new Date().toISOString()
};

// Salvar resumo
await Actor.pushData(summary);

// Salvar cada imóvel como entrada separada para melhor visualização
for (let i = 0; i < filteredProperties.length; i++) {
    const property = filteredProperties[i];
    
    // Adicionar informações extras para cada imóvel
    const propertyData = {
        ...property,
        searchQuery: query,
        propertyIndex: i + 1,
        totalProperties: filteredProperties.length,
        priceFormatted: property.price ? `${property.price.toLocaleString()} €` : 'N/A',
        areaFormatted: property.area ? `${property.area} m²` : 'N/A',
        pricePerSqmFormatted: property.pricePerSqm ? `${property.pricePerSqm} €/m²` : 'N/A',
        timestamp: new Date().toISOString()
    };
    
    await Actor.pushData(propertyData);
}

console.log('\n✅ Scraping concluído!');
console.log(`📊 Dados salvos: 1 resumo + ${filteredProperties.length} imóveis individuais`);

await Actor.exit();
