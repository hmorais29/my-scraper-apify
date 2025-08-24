import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';
import * as cheerio from 'cheerio';

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

// Função para construir URLs
function buildUrls(criteria) {
    const urls = {};
    
    // Imovirtual URL
    let imovirtualUrl = `https://www.imovirtual.com/comprar/${criteria.type}`;
    if (criteria.location) {
        imovirtualUrl += `/${criteria.location.replace(/\s+/g, '-')}`;
    }
    
    // Adicionar parâmetros de pesquisa para tipologia
    if (criteria.rooms) {
        const roomNumber = criteria.rooms.replace('T', '');
        imovirtualUrl += `?search%255Bfilter_float_number_of_rooms%253Afrom%255D=${roomNumber}&search%255Bfilter_float_number_of_rooms%253Ato%255D=${roomNumber}`;
    }
    
    urls.imovirtual = imovirtualUrl;
    
    // ERA Portugal URL
    let eraUrl = `https://www.era.pt/comprar/${criteria.type}s`;
    if (criteria.location) {
        eraUrl += `/${criteria.location.replace(/\s+/g, '-')}`;
    }
    urls.era = eraUrl;
    
    return urls;
}

// Função melhorada para scraping da ERA
async function scrapeERA($, url) {
    console.log('\n🏠 Processando ERA Portugal...');
    
    const properties = [];
    const htmlContent = $.html();
    
    console.log(`📄 Tamanho do HTML: ${htmlContent.length} caracteres`);
    console.log(`📝 Primeiros 200 caracteres do body:`);
    console.log(htmlContent.substring(0, 200));
    
    if (htmlContent.length > 0) {
        console.log('✅ Conteúdo HTML disponível, procurando propriedades...');
        
        // Lista de seletores mais específicos para a ERA
        const selectors = [
            '.property-card',
            '.property-item', 
            '.listing-item',
            '.search-result-item',
            '.property-result',
            '.result-item',
            '.property',
            '.listing',
            '.imovel',
            '.card-property',
            '.property-listing',
            'div[class*="property"]',
            'div[class*="listing"]', 
            'div[class*="imovel"]',
            'div[class*="result"]',
            'article[class*="property"]',
            'article[class*="listing"]',
            'article:has(.price), article:has([class*="price"])',
            'div:has(.price):has(.area)',
            'div:has([class*="euro"]):has([class*="metro"])',
            '.card:has(a[href*="imovel"])',
            '.item:has(a[href*="propriedade"])',
            'div:has(a[href*="apartamento"])',
            '[data-property-id]',
            '[data-listing-id]',
            '[data-testid*="property"]',
            'a[href*="/imovel/"], a[href*="/propriedade/"], a[href*="/apartamento/"]'
        ];
        
        let bestSelector = '';
        let maxProperties = 0;
        
        for (const selector of selectors) {
            try {
                const elements = $(selector);
                const propertiesFound = elements.length;
                let validProperties = 0;
                
                elements.each((index, element) => {
                    const $el = $(element);
                    const hasPrice = $el.find('[class*="price"], [class*="euro"], [class*="preco"]').length > 0 || 
                                   $el.text().match(/€|EUR|\d+\.\d+/) !== null;
                    const hasArea = $el.find('[class*="area"], [class*="metro"], [class*="m2"]').length > 0 || 
                                  $el.text().match(/m²|m2|\d+\s*metros/) !== null;
                    
                    if (hasPrice || hasArea) {
                        validProperties++;
                    }
                });
                
                console.log(`📊 Seletor "${selector}": ${propertiesFound} elementos, ${validProperties} com dados de propriedades`);
                
                if (validProperties > maxProperties) {
                    maxProperties = validProperties;
                    bestSelector = selector;
                }
            } catch (error) {
                // Seletor inválido, continuar
            }
        }
        
        console.log(`🎯 Melhor seletor: "${bestSelector}" com ${maxProperties} propriedades`);
        
        // Se não encontrou com seletores específicos, fazer busca agressiva
        if (maxProperties === 0) {
            console.log('🔍 Fazendo busca agressiva por elementos com preços...');
            console.log('🚨 Iniciando busca agressiva na ERA...');
            
            // Buscar todos os elementos que contêm preços
            const priceElements = $('*').filter(function() {
                const text = $(this).text();
                return text.match(/€|EUR|\d+[.,]\d+/);
            });
            
            console.log(`💰 Encontrados ${priceElements.length} elementos com preços`);
            
            const processedLinks = new Set();
            
            priceElements.each((index, element) => {
                try {
                    const $el = $(element);
                    const $parent = $el.closest('div, article, section, li');
                    
                    // Buscar informações básicas
                    const titleEl = $parent.find('h1, h2, h3, h4, .title, [class*="title"], a[href*="imovel"], a[href*="apartamento"]').first();
                    const priceEl = $parent.find('[class*="price"], [class*="euro"], [class*="preco"]').first();
                    const areaEl = $parent.find('[class*="area"], [class*="metro"], [class*="m2"]').first();
                    const linkEl = $parent.find('a[href*="imovel"], a[href*="apartamento"], a[href*="propriedade"]').first();
                    
                    let title = titleEl.length ? titleEl.text().trim() : '';
                    let price = priceEl.length ? priceEl.text().trim() : '';
                    let area = areaEl.length ? areaEl.text().trim() : '';
                    let link = linkEl.length ? linkEl.attr('href') : '';
                    
                    // Se não encontrou, buscar no texto do elemento
                    if (!title) {
                        const parentText = $parent.text();
                        const sentences = parentText.split(/[.!?]/).filter(s => s.length > 10);
                        title = sentences[0] ? sentences[0].trim() : '';
                    }
                    
                    if (!price) {
                        const priceMatch = $parent.text().match(/(\d+[.,]\d+)\s*€/);
                        price = priceMatch ? priceMatch[0] : '';
                    }
                    
                    if (!area) {
                        const areaMatch = $parent.text().match(/(\d+[.,]?\d*)\s*m[²2]/);
                        area = areaMatch ? areaMatch[0] : '';
                    }
                    
                    // Validar se tem informações mínimas
                    if ((title || price) && !processedLinks.has(link)) {
                        processedLinks.add(link);
                        
                        // Extrair tipologia do título
                        let rooms = '';
                        const roomsMatch = title.match(/T([0-9])/i);
                        if (roomsMatch) {
                            rooms = 'T' + roomsMatch[1];
                        }
                        
                        // Extrair localização
                        let location = '';
                        const locationMatch = title.match(/(caldas da rainha|lisboa|porto|coimbra)/i);
                        if (locationMatch) {
                            location = locationMatch[1];
                        }
                        
                        const property = {
                            title: title.substring(0, 100),
                            price: price,
                            area: area,
                            rooms: rooms,
                            location: location,
                            link: link ? (link.startsWith('http') ? link : `https://www.era.pt${link}`) : url,
                            source: 'ERA Portugal'
                        };
                        
                        // Só adicionar se tiver pelo menos título e preço ou área
                        if (property.title && (property.price || property.area)) {
                            properties.push(property);
                        }
                    }
                } catch (error) {
                    // Ignorar erros de elementos individuais
                }
            });
            
            console.log(`🎯 Busca agressiva concluída: ${properties.length} propriedades únicas`);
        } else {
            // Usar o melhor seletor encontrado
            $(bestSelector).each((index, element) => {
                try {
                    const $el = $(element);
                    
                    // Extrair informações
                    const title = $el.find('h1, h2, h3, .title, [class*="title"]').first().text().trim() ||
                                 $el.find('a').first().text().trim() ||
                                 $el.text().split('\n')[0].trim();
                    
                    const priceText = $el.find('[class*="price"], [class*="euro"], [class*="preco"]').first().text().trim() ||
                                     ($el.text().match(/\d+[.,]\d+\s*€/) || [''])[0];
                    
                    const areaText = $el.find('[class*="area"], [class*="metro"], [class*="m2"]').first().text().trim() ||
                                    ($el.text().match(/\d+[.,]?\d*\s*m[²2]/) || [''])[0];
                    
                    const link = $el.find('a').first().attr('href') || '';
                    
                    if (title && (priceText || areaText)) {
                        // Extrair tipologia
                        let rooms = '';
                        const roomsMatch = title.match(/T([0-9])/i);
                        if (roomsMatch) {
                            rooms = 'T' + roomsMatch[1];
                        }
                        
                        // Extrair localização
                        let location = '';
                        const locationMatch = title.match(/(caldas da rainha|lisboa|porto|coimbra)/i);
                        if (locationMatch) {
                            location = locationMatch[1];
                        }
                        
                        properties.push({
                            title: title.substring(0, 100),
                            price: priceText,
                            area: areaText,
                            rooms: rooms,
                            location: location,
                            link: link ? (link.startsWith('http') ? link : `https://www.era.pt${link}`) : url,
                            source: 'ERA Portugal'
                        });
                    }
                } catch (error) {
                    // Ignorar erros de elementos individuais
                }
            });
        }
    }
    
    console.log(`✅ ERA Portugal processado: ${properties.length} imóveis encontrados`);
    return properties;
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

const urls = buildUrls(criteria);
console.log('🌐 Imovirtual:', urls.imovirtual);
console.log('🌐 ERA Portugal:', urls.era);
console.log('');

console.log('🚀 Iniciando scraping...');

const crawler = new CheerioCrawler({
    requestHandler: async ({ request, $ }) => {
        console.log(`\n📊 Status: ${request.loadedUrl ? '200' : 'Error'}`);
        
        if (request.url.includes('era.pt')) {
            console.log('✅ ERA Portugal acessível!');
            return await scrapeERA($, request.url);
        } else if (request.url.includes('imovirtual.com')) {
            console.log('✅ Imovirtual acessível!');
            return await scrapeImovirtual($);
        }
    }
});

// Executar scraping
await crawler.run([urls.era, urls.imovirtual]);

// Obter todos os resultados
const allProperties = [];

// Como estamos usando o crawler, vamos reformular para coletar os dados
const eraProperties = await scrapeERA(cheerio.load(''), urls.era);
const imovirtualProperties = await scrapeImovirtual(cheerio.load(''));

allProperties.push(...eraProperties, ...imovirtualProperties);

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
}

// Salvar dados no dataset
if (filteredProperties.length > 0) {
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
}

await Actor.exit();
