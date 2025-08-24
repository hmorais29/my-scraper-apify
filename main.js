import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput() || {};
console.log('🔥 Input recebido:', input);

const query = input.query || 'Imóvel T3 Lisboa';
console.log(`🔍 Query: "${query}"`);

// Função para extrair critérios da query
function extractCriteria(query) {
    const criteria = {
        location: '',
        rooms: '',
        area: '',
        condition: '',
        type: 'apartamento',
        originalQuery: query
    };
    
    const queryLower = query.toLowerCase();
    
    // Extrair tipologia (T1, T2, T3, T4, T5)
    const roomsMatch = queryLower.match(/t([0-9])/);
    if (roomsMatch) {
        criteria.rooms = 'T' + roomsMatch[1];
    }
    
    // Extrair localização (última palavra/palavras significativas)
    const locationWords = queryLower.replace(/imóvel|apartamento|casa|moradia|t[0-9]/g, '').trim().split(' ').filter(w => w.length > 2);
    criteria.location = locationWords.join(' ');
    
    return criteria;
}

// Função para construir URL do Imovirtual
function buildImovirtualUrl(criteria) {
    let imovirtualUrl = `https://www.imovirtual.com/comprar/${criteria.type}`;
    if (criteria.location) {
        imovirtualUrl += `/${criteria.location.replace(/\s+/g, '-')}`;
    }
    
    // Adicionar parâmetros de pesquisa para tipologia
    if (criteria.rooms) {
        const roomNumber = criteria.rooms.replace('T', '');
        imovirtualUrl += `?search%255Bfilter_float_number_of_rooms%253Afrom%255D=${roomNumber}&search%255Bfilter_float_number_of_rooms%253Ato%255D=${roomNumber}`;
    }
    
    return imovirtualUrl;
}

// Função para scraping do Imovirtual
async function scrapeImovirtual($) {
    console.log('\n🏠 Processando Imovirtual...');
    
    const properties = [];
    const listingElements = $('[data-cy="listing-item"]');
    
    console.log(`📊 Encontrados ${listingElements.length} imóveis`);
    
    listingElements.each((index, element) => {
        try {
            const $listing = $(element);
            
            // Extrair informações básicas
            const title = $listing.find('h3 a, .offer-item-title a, [data-cy="listing-item-link"]').first().text().trim();
            const priceText = $listing.find('[class*="price"], [data-cy="price"]').first().text().trim();
            const areaText = $listing.find('[class*="area"], [title*="m²"]').first().text().trim();
            const link = $listing.find('h3 a, .offer-item-title a, [data-cy="listing-item-link"]').first().attr('href');
            const locationText = $listing.find('[class*="location"], [class*="address"]').first().text().trim();
            
            // Extrair tipologia do título
            let rooms = '';
            const roomsMatch = title.match(/T([0-9])/i);
            if (roomsMatch) {
                rooms = 'T' + roomsMatch[1];
            }
            
            // Processar localização
            let location = locationText || 'N/A';
            if (title.toLowerCase().includes('caldas da rainha')) {
                location = 'Caldas da Rainha';
            }
            
            if (title) {
                const property = {
                    title,
                    price: priceText || 'N/A',
                    area: areaText || 'N/A', 
                    rooms: rooms || 'N/A',
                    location,
                    link: link ? `https://www.imovirtual.com${link}` : 'N/A',
                    source: 'ImóVirtual'
                };
                
                properties.push(property);
                
                console.log(`✅ Imóvel ${index + 1}:`);
                console.log(`   📋 Título: ${property.title}`);
                console.log(`   💰 Preço: ${property.price}`);
                console.log(`   📐 Área: ${property.area}`);
                console.log(`   🏠 Tipologia: ${property.rooms}`);
                console.log(`   📍 Localização: ${property.location}`);
                console.log(`   🔗 Link: ${property.link}`);
                console.log('');
            }
        } catch (error) {
            console.log(`❌ Erro ao processar imóvel ${index + 1}:`, error.message);
        }
    });
    
    console.log(`✅ ImóVirtual processado: ${properties.length} imóveis encontrados`);
    return properties;
}

// Função para normalizar preços e áreas
function normalizeProperty(property) {
    // Normalizar preço
    let price = property.price;
    let priceNum = 0;
    if (typeof price === 'string') {
        const priceMatch = price.match(/(\d+(?:[.,]\d+)*)/);
        if (priceMatch) {
            priceNum = parseFloat(priceMatch[1].replace(/[.,]/g, ''));
            // Se o número for muito pequeno, pode estar em formato com pontos como separadores de milhares
            if (priceNum < 1000 && price.includes('.')) {
                priceNum = parseFloat(priceMatch[1].replace(/\./g, '').replace(/,/g, '.'));
            }
        }
    }
    
    // Normalizar área
    let area = property.area;
    let areaNum = 0;
    if (typeof area === 'string') {
        const areaMatch = area.match(/(\d+(?:[.,]\d+)?)/);
        if (areaMatch) {
            areaNum = parseFloat(areaMatch[1].replace(',', '.'));
        }
    }
    
    // Calcular preço por m²
    let pricePerM2 = 0;
    if (priceNum > 0 && areaNum > 0) {
        pricePerM2 = Math.round(priceNum / areaNum);
    }
    
    return {
        ...property,
        priceNum,
        areaNum,
        pricePerM2
    };
}

// Main execution
const criteria = extractCriteria(query);
console.log('📋 Critérios extraídos:', criteria);

const imovirtualUrl = buildImovirtualUrl(criteria);
console.log('🌐 Imovirtual:', imovirtualUrl);
console.log('');

console.log('🚀 Iniciando scraping...');

// Array para coletar todos os resultados
const allProperties = [];

const crawler = new CheerioCrawler({
    requestHandler: async ({ request, $ }) => {
        console.log(`\n📊 Status: ${request.loadedUrl ? '200' : 'Error'}`);
        console.log('✅ Imovirtual acessível!');
        
        const properties = await scrapeImovirtual($);
        
        // Adicionar propriedades ao array global
        allProperties.push(...properties);
        
        return properties;
    }
});

// Executar scraping apenas no Imovirtual
await crawler.run([imovirtualUrl]);

// Normalizar propriedades
const normalizedProperties = allProperties.map(normalizeProperty);

// Aplicar filtros baseados nos critérios
let filteredProperties = normalizedProperties;

if (criteria.rooms) {
    filteredProperties = filteredProperties.filter(prop => 
        prop.rooms && prop.rooms.toLowerCase() === criteria.rooms.toLowerCase()
    );
}

console.log('\n📊 === RELATÓRIO FINAL ===');
console.log(`🏠 Total de imóveis encontrados: ${allProperties.length}`);
console.log(`🔍 Filtro tipologia ${criteria.rooms}: ${allProperties.length} → ${filteredProperties.length}`);

if (filteredProperties.length > 0) {
    console.log('\n🎯 === IMÓVEIS ENCONTRADOS ===\n');
    
    filteredProperties.forEach((property, index) => {
        console.log(`${index + 1}. ${property.title}`);
        console.log(`   💰 Preço: ${property.price}`);
        console.log(`   📐 Área: ${property.area}`);
        console.log(`   🏠 Tipologia: ${property.rooms}`);
        console.log(`   📍 Local: ${property.location}`);
        console.log(`   🌐 Site: ${property.source}`);
        console.log(`   🔗 Link: ${property.link}`);
        if (property.pricePerM2 > 0) {
            console.log(`   💵 Preço/m²: ${property.pricePerM2} €/m²`);
        }
        console.log('');
    });

    // Salvar dados no dataset
    console.log('\n📊 Dados a serem salvos:');
    
    // Salvar apenas os imóveis individuais
    for (const property of filteredProperties) {
        const propertyData = {
            id: 'imovel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            tipo: 'imovel',
            titulo: property.title,
            preco: property.price,
            area: property.area,
            tipologia: property.rooms,
            localizacao: property.location,
            site: property.source,
            link: property.link,
            precoM2: property.pricePerM2,
            query: criteria.originalQuery,
            timestamp: new Date().toISOString(),
            // Adicionar metadados da pesquisa
            totalEncontrados: allProperties.length,
            totalFiltrados: filteredProperties.length,
            criterios: criteria
        };
        
        await Actor.pushData(propertyData);
    }
    
    console.log(`✅ Scraping concluído!`);
    console.log(`📊 Dados salvos: ${filteredProperties.length} imóveis individuais`);
} else {
    console.log('\n❌ Nenhum imóvel encontrado com os critérios especificados.');
}

await Actor.exit();
