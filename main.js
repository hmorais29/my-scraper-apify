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

// Função para construir URLs - Apenas Imovirtual
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

// Handler para ImóVirtual
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
                console.log(`   📏 Área: ${area ? area + ' m²' : 'N/A'}`);
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

// Configuração principal
const input = await Actor.getInput();
const query = input?.query || 'Imóvel T4 caldas da Rainha novo';

console.log('📥 Input recebido:', { query });
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
    console.log(`   📏 Área: ${property.area ? property.area + ' m²' : 'N/A'}`);
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
