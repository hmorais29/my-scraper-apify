import { Actor } from 'apify';
import { gotScraping } from 'got-scraping';

const IMOVIRTUAL_API = 'https://www.imovirtual.com/api/query';

// Query GraphQL exata da captura do DevTools
const AUTOCOMPLETE_QUERY = `query autocomplete($query: String!, $ranking: RankingSystemInput, $levels: [String!], $isLocationSearch: Boolean!, $locationLevelLikeDistrictAndSubdistrict: [String!]) {
  autocomplete(query: $query, ranking: $ranking, levels: $levels) {
    ... on FoundLocations {
      locationsObjects {
        id
        detailedLevel
        name
        fullName
        parents {
          id
          detailedLevel
          name
          fullName
          __typename
        }
        parentIds
        children(
          input: {limit: 4, filters: {levels: $locationLevelLikeDistrictAndSubdistrict}}
        ) @include(if: $isLocationSearch) {
          id
          detailedLevel
          name
          fullName
          parents {
            id
            detailedLevel
            name
            fullName
            __typename
          }
          children(
            input: {limit: 1, filters: {levels: $locationLevelLikeDistrictAndSubdistrict}}
          ) {
            id
            detailedLevel
            name
            fullName
            parents {
              id
              detailedLevel
              name
              fullName
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    ... on ErrorInternal {
      message
      __typename
    }
    __typename
  }
}`;

async function makeGraphQLRequest(query) {
    console.log(`🔍 A pesquisar localizações para: ${query}`);
    
    const payload = {
        extensions: {
            persistedQuery: {
                miss: true,
                sha256Hash: "63dfe8182f8cd71a2493912ed138c743f8fdb43e741e11aff9e53bc34b85c9d6",
                version: 1
            }
        },
        operationName: "autocomplete",
        query: AUTOCOMPLETE_QUERY,
        variables: {
            isLocationSearch: true,
            locationLevelLikeDistrictAndSubdistrict: ["parish", "neighborhood"],
            query: query,
            ranking: {
                type: "BLENDED_INFIX_LOOKUP_SUGGEST"
            }
        }
    };

    const headers = {
        'accept': 'application/graphql-response+json, application/graphql+json, application/json, text/event-stream, multipart/mixed',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'en-US,en;q=0.9,pt;q=0.8',
        'content-type': 'application/json',
        'origin': 'https://www.imovirtual.com',
        'referer': 'https://www.imovirtual.com/',
        'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
    };

    try {
        const response = await gotScraping.post(IMOVIRTUAL_API, {
            json: payload,
            headers: headers,
            responseType: 'json',
            timeout: {
                request: 25000
            },
            retry: {
                limit: 1,
                methods: ['POST']
            },
            throwHttpErrors: false
        });

        if (response.statusCode !== 200) {
            console.log(`⚠️ Status ${response.statusCode} para "${query}"`);
            return null;
        }
        
        return response.body;
    } catch (error) {
        console.error(`❌ Erro para "${query}":`, error.message);
        return null;
    }
}

// Função para normalizar nomes para slugs
function normalizeToSlug(name) {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Função para gerar aliases (variações do nome)
function generateAliases(name, fullName) {
    const aliases = new Set([name]);
    
    // Adicionar nome completo sem a hierarquia
    aliases.add(name);
    
    // Adicionar variações sem "e", "de", "da", etc.
    const cleanName = name.replace(/\b(e|de|da|do|dos|das)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (cleanName !== name) {
        aliases.add(cleanName);
    }
    
    // Se tem hífen, adicionar partes separadas
    if (name.includes('-')) {
        name.split('-').forEach(part => {
            part = part.trim();
            if (part.length > 3) aliases.add(part);
        });
    }
    
    // Se tem "e", adicionar partes separadas
    if (name.includes(' e ')) {
        name.split(' e ').forEach(part => {
            part = part.trim();
            if (part.length > 3) aliases.add(part);
        });
    }
    
    return Array.from(aliases);
}

function processLocations(data, queryTerm, locationHierarchy) {
    if (!data?.data?.autocomplete?.locationsObjects) {
        return;
    }

    const locationsObjects = data.data.autocomplete.locationsObjects;
    console.log(`📊 Processando ${locationsObjects.length} localizações para "${queryTerm}"`);

    for (const location of locationsObjects) {
        const { id, detailedLevel, name, fullName, children, parents } = location;
        
        // Extrair hierarquia dos parents
        let districtName = '', districtSlug = '';
        let councilName = '', councilSlug = '';
        
        if (parents && parents.length > 0) {
            for (const parent of parents) {
                if (parent.detailedLevel === 'district') {
                    districtName = parent.name;
                    districtSlug = normalizeToSlug(parent.name);
                } else if (parent.detailedLevel === 'council') {
                    councilName = parent.name;
                    councilSlug = normalizeToSlug(parent.name);
                }
            }
        }

        // Para distritos
        if (detailedLevel === 'district') {
            districtName = name;
            districtSlug = normalizeToSlug(name);
            if (!locationHierarchy[districtSlug]) {
                locationHierarchy[districtSlug] = {};
                console.log(`🏛️ Distrito: ${name} (${districtSlug})`);
            }
        }
        
        // Para concelhos
        else if (detailedLevel === 'council' && districtSlug) {
            councilName = name;
            councilSlug = normalizeToSlug(name);
            
            if (!locationHierarchy[districtSlug]) {
                locationHierarchy[districtSlug] = {};
            }
            if (!locationHierarchy[districtSlug][councilSlug]) {
                locationHierarchy[districtSlug][councilSlug] = {};
                console.log(`🏘️ Concelho: ${name} (${councilSlug}) em ${districtName}`);
            }
        }
        
        // Para freguesias e bairros
        else if ((detailedLevel === 'parish' || detailedLevel === 'neighborhood') && districtSlug && councilSlug) {
            const locationSlug = normalizeToSlug(name);
            const aliases = generateAliases(name, fullName);
            
            if (!locationHierarchy[districtSlug]) {
                locationHierarchy[districtSlug] = {};
            }
            if (!locationHierarchy[districtSlug][councilSlug]) {
                locationHierarchy[districtSlug][councilSlug] = {};
            }
            
            locationHierarchy[districtSlug][councilSlug][locationSlug] = aliases;
            
            const typeIcon = detailedLevel === 'parish' ? '⛪' : '🏠';
            console.log(`${typeIcon} ${detailedLevel}: ${name} (${locationSlug}) em ${councilName}, ${districtName}`);
        }

        // Processar children recursivamente
        if (children && Array.isArray(children)) {
            for (const child of children) {
                const childData = {
                    data: {
                        autocomplete: {
                            locationsObjects: [child]
                        }
                    }
                };
                processLocations(childData, `${queryTerm}-child`, locationHierarchy);
            }
        }
    }
}

Actor.main(async () => {
    console.log('📡 A iniciar extração OTIMIZADA de localizações do Imovirtual...');

    const locationHierarchy = {};

    // ESTRATÉGIA OTIMIZADA: Mais abrangente para capturar freguesias
    const strategicQueries = [
        // Todos os distritos de Portugal
        'lisboa', 'porto', 'coimbra', 'braga', 'aveiro', 'faro', 'leiria',
        'santarem', 'setubal', 'viseu', 'viana do castelo', 'vila real',
        'braganca', 'castelo branco', 'evora', 'guarda', 'portalegre',
        'beja', 'madeira', 'sao miguel', 'terceira',
        
        // Principais concelhos por distrito
        'sintra', 'cascais', 'oeiras', 'loures', 'amadora', 'odivelas', 'almada', 'seixal',
        'matosinhos', 'vila nova de gaia', 'gondomar', 'maia', 'povoa de varzim',
        'guimaraes', 'braga', 'famalicao', 'barcelos',
        'figueira da foz', 'agueda', 'ilhavo', 'ovar',
        'portimao', 'lagos', 'silves', 'albufeira', 'loule', 'tavira',
        'caldas da rainha', 'torres vedras', 'obidos', 'marinha grande',
        'torres novas', 'tomar', 'entroncamento', 'abrantes',
        'palmela', 'montijo', 'sesimbra', 'alcochete',
        'funchal', 'machico', 'ponta delgada', 'angra do heroismo',
        
        // Queries específicas para capturar mais freguesias
        'santo antonio', 'santo', 'santa', 'sao', 'vila', 'aldeia',
        'cavaleiros', 'frielas', 'moscavide', 'sacavem', 'bobadela',
        'caneças', 'bucelas', 'fanhoes', 'lousa', 'santo antonio dos cavaleiros',
        'uniao das freguesias', 'freguesia', 'bairro', 'zona', 'centro'
    ];

    let successfulQueries = 0;
    let totalProcessed = 0;

    console.log(`🎯 Queries estratégicas: ${strategicQueries.length}`);

    for (const query of strategicQueries) {
        try {
            console.log(`\n📄 [${totalProcessed + 1}/${strategicQueries.length}] "${query}"`);
            
            const data = await makeGraphQLRequest(query);
            
            if (data?.data?.autocomplete?.locationsObjects) {
                processLocations(data, query, locationHierarchy);
                successfulQueries++;
                console.log(`✅ "${query}" processada`);
            } else {
                console.log(`⚠️ Sem dados para "${query}"`);
            }
            
            totalProcessed++;
            
            // Pausa mais curta mas inteligente
            const waitTime = totalProcessed % 15 === 0 ? 3000 : 1500;
            console.log(`⏳ Pausa ${waitTime/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
        } catch (error) {
            console.error(`❌ Falha "${query}":`, error.message);
            totalProcessed++;
            continue;
        }
    }

    // Contar totais
    let totalDistricts = Object.keys(locationHierarchy).length;
    let totalCouncils = 0;
    let totalLocations = 0;

    for (const district of Object.values(locationHierarchy)) {
        totalCouncils += Object.keys(district).length;
        for (const council of Object.values(district)) {
            totalLocations += Object.keys(council).length;
        }
    }

    console.log('\n📊 EXTRAÇÃO OTIMIZADA CONCLUÍDA!');
    console.log('=====================================');
    console.log(`🏛️ Distritos: ${totalDistricts}`);
    console.log(`🏘️ Concelhos: ${totalCouncils}`);
    console.log(`⛪🏠 Freguesias/Bairros: ${totalLocations}`);
    console.log(`✅ Queries bem-sucedidas: ${successfulQueries}/${totalProcessed}`);
    console.log('=====================================');

    // Verificar se encontrou Loures específico
    const louresCheck = locationHierarchy['lisboa']?.['loures'];
    if (louresCheck) {
        console.log('\n🎯 Localizações em Loures encontradas:');
        Object.keys(louresCheck).forEach(slug => {
            const aliases = louresCheck[slug];
            console.log(`  ✅ ${slug}: ${aliases.join(', ')}`);
        });
    }

    // DADOS PRINCIPAIS: locations.json para o outro scraper
    const locationsJsonData = {
        locations: locationHierarchy,
        metadata: {
            extractedAt: new Date().toISOString(),
            totalDistricts: totalDistricts,
            totalCouncils: totalCouncils,
            totalLocations: totalLocations,
            successfulQueries: successfulQueries,
            totalQueries: totalProcessed,
            source: 'imovirtual.com'
        }
    };

    await Actor.pushData(locationsJsonData);
    console.log('💾 locations.json guardado no dataset principal');

    // DADOS ADICIONAIS: Estrutura expandida para análise
    const expandedData = [];
    
    for (const [districtSlug, councils] of Object.entries(locationHierarchy)) {
        for (const [councilSlug, locations] of Object.entries(councils)) {
            for (const [locationSlug, aliases] of Object.entries(locations)) {
                expandedData.push({
                    type: 'location',
                    district: districtSlug,
                    council: councilSlug,
                    slug: locationSlug,
                    aliases: aliases,
                    url_path: `${districtSlug}/${councilSlug}/${locationSlug}`,
                    primary_name: aliases[0]
                });
            }
        }
    }

    for (const item of expandedData) {
        await Actor.pushData(item);
    }

    console.log(`✅ ${expandedData.length} localizações individuais também guardadas`);
    
    // Salvar também apenas o locationHierarchy para usar diretamente como locations.json
    await Actor.pushData({
        format: 'locations_json_only',
        data: locationHierarchy
    });
    
    console.log('📁 Formato locations.json puro também guardado');
});
