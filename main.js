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
          input: {limit: 10, filters: {levels: $locationLevelLikeDistrictAndSubdistrict}}
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
            input: {limit: 10, filters: {levels: $locationLevelLikeDistrictAndSubdistrict}}
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

async function makeGraphQLRequest(query, retries = 3) {
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

    // Headers mais completos baseados na captura
    const headers = {
        'accept': 'application/graphql-response+json, application/graphql+json, application/json, text/event-stream, multipart/mixed',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'pt-PT,pt;q=0.9,en;q=0.8',
        'content-type': 'application/json',
        'origin': 'https://www.imovirtual.com',
        'referer': 'https://www.imovirtual.com/',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await gotScraping.post(IMOVIRTUAL_API, {
                json: payload,
                headers: headers,
                responseType: 'json',
                timeout: {
                    request: 30000
                },
                retry: {
                    limit: 0 // Vamos controlar os retries manualmente
                }
            });

            console.log(`✅ Resposta recebida com status: ${response.statusCode}`);
            
            if (response.body?.errors) {
                console.log(`⚠️ Erros na resposta:`, response.body.errors);
            }
            
            return response.body;
        } catch (error) {
            console.error(`❌ Tentativa ${attempt}/${retries} falhou para "${query}":`, error.message);
            
            if (error.response) {
                console.error(`📊 Status: ${error.response.statusCode}`);
                if (error.response.statusCode === 429) {
                    console.log('⏳ Rate limit detectado, aumentando tempo de espera...');
                    await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
                    continue;
                }
            }
            
            if (attempt === retries) {
                throw error;
            }
            
            // Esperar antes da próxima tentativa
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }
}

function processLocations(data, queryTerm) {
    const locations = {
        districts: new Set(),
        councils: new Set(), 
        parishes: new Set(),
        neighborhoods: new Set()
    };

    if (!data?.data?.autocomplete?.locationsObjects) {
        console.log(`⚠️ Sem dados de localização para "${queryTerm}"`);
        return locations;
    }

    const locationsObjects = data.data.autocomplete.locationsObjects;
    console.log(`📊 Processando ${locationsObjects.length} localizações para "${queryTerm}"`);

    function addLocation(locationObj, source, parentName = null) {
        const { id, detailedLevel, name, fullName } = locationObj;
        
        const locationData = {
            id,
            name,
            fullName,
            level: detailedLevel,
            source: source,
            parent: parentName,
            extractedAt: new Date().toISOString()
        };

        const key = JSON.stringify(locationData);

        switch (detailedLevel) {
            case 'district':
                locations.districts.add(key);
                console.log(`🏛️ Distrito: ${fullName}`);
                break;
            case 'council':
                locations.councils.add(key);
                console.log(`🏘️ Concelho: ${fullName}`);
                break;
            case 'parish':
                locations.parishes.add(key);
                console.log(`⛪ Freguesia: ${fullName}`);
                break;
            case 'neighborhood':
                locations.neighborhoods.add(key);
                console.log(`🏠 Bairro: ${fullName}`);
                break;
        }
    }

    // Processar localizações principais
    for (const location of locationsObjects) {
        addLocation(location, queryTerm);

        // Processar children (freguesias e bairros)
        if (location.children && Array.isArray(location.children)) {
            for (const child of location.children) {
                addLocation(child, queryTerm, location.fullName);

                // Processar grandchildren (bairros dentro de freguesias)
                if (child.children && Array.isArray(child.children)) {
                    for (const grandChild of child.children) {
                        addLocation(grandChild, queryTerm, child.fullName);
                    }
                }
            }
        }
    }

    return locations;
}

Actor.main(async () => {
    console.log('📡 A iniciar extração completa de localizações do Imovirtual...');

    // Testar conectividade primeiro
    try {
        const testResponse = await gotScraping.get('https://www.imovirtual.com/', { 
            timeout: {
                request: 10000
            },
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
            }
        });
        console.log(`✅ Site principal acessível: ${testResponse.statusCode}`);
    } catch (error) {
        console.error('❌ Erro ao aceder ao site principal:', error.message);
        console.log('🔄 Continuando mesmo assim...');
    }

    const allLocations = {
        districts: new Set(),
        councils: new Set(),
        parishes: new Set(),
        neighborhoods: new Set()
    };

    // Queries estratégicas para cobrir todo Portugal
    // Começamos com os distritos principais
    const mainQueries = [
        // Distritos principais
        'lisboa', 'porto', 'coimbra', 'braga', 'aveiro', 'setúbal', 'faro', 
        'viseu', 'leiria', 'santarém', 'viana do castelo', 'vila real',
        'bragança', 'guarda', 'castelo branco', 'évora', 'beja', 'portalegre',
        
        // Cidades importantes que podem revelar mais localizações
        'sintra', 'cascais', 'oeiras', 'almada', 'amadora', 'loures',
        'matosinhos', 'vila nova de gaia', 'gondomar', 'maia', 'valongo',
        'figueira da foz', 'águeda', 'oliveira de azeméis',
        'torres vedras', 'caldas da rainha', 'óbidos',
        'portimão', 'lagos', 'tavira', 'olhão',
        
        // Regiões autónomas
        'funchal', 'machico', 'câmara de lobos',  // Madeira
        'angra do heroísmo', 'ponta delgada', 'horta'  // Açores
    ];

    let successfulQueries = 0;
    let totalProcessed = 0;

    console.log(`🎯 Vamos processar ${mainQueries.length} queries principais`);

    for (const query of mainQueries) {
        try {
            console.log(`\n📄 Processando query ${totalProcessed + 1}/${mainQueries.length}: "${query}"`);
            
            const data = await makeGraphQLRequest(query);
            
            if (data?.data?.autocomplete?.locationsObjects) {
                const locations = processLocations(data, query);
                
                // Combinar resultados usando Sets para evitar duplicados
                for (const item of locations.districts) allLocations.districts.add(item);
                for (const item of locations.councils) allLocations.councils.add(item);
                for (const item of locations.parishes) allLocations.parishes.add(item);
                for (const item of locations.neighborhoods) allLocations.neighborhoods.add(item);
                
                successfulQueries++;
                console.log(`✅ Query "${query}" processada com sucesso`);
            } else {
                console.log(`⚠️ Sem dados válidos para "${query}"`);
            }
            
            totalProcessed++;
            
            // Pausa entre requests - aumentar para evitar rate limiting
            const waitTime = 3000 + Math.random() * 2000; // 3-5 segundos aleatório
            console.log(`⏳ Aguardando ${Math.round(waitTime/1000)} segundos...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
        } catch (error) {
            console.error(`❌ Falha na query "${query}":`, error.message);
            totalProcessed++;
            
            // Pausa extra após erro
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }
    }

    // Converter Sets de volta para Arrays e parsear JSON
    const finalData = {
        districts: Array.from(allLocations.districts).map(item => JSON.parse(item)),
        councils: Array.from(allLocations.councils).map(item => JSON.parse(item)),
        parishes: Array.from(allLocations.parishes).map(item => JSON.parse(item)),
        neighborhoods: Array.from(allLocations.neighborhoods).map(item => JSON.parse(item)),
        metadata: {
            extractedAt: new Date().toISOString(),
            totalDistricts: allLocations.districts.size,
            totalCouncils: allLocations.councils.size,
            totalParishes: allLocations.parishes.size,
            totalNeighborhoods: allLocations.neighborhoods.size,
            successfulQueries: successfulQueries,
            totalQueries: mainQueries.length,
            source: 'imovirtual.com',
            endpoint: IMOVIRTUAL_API,
            version: '2.0'
        }
    };

    console.log('\n📊 EXTRAÇÃO CONCLUÍDA!');
    console.log('=====================================');
    console.log(`🏛️ Distritos encontrados: ${finalData.metadata.totalDistricts}`);
    console.log(`🏘️ Concelhos encontrados: ${finalData.metadata.totalCouncils}`);
    console.log(`⛪ Freguesias encontradas: ${finalData.metadata.totalParishes}`);
    console.log(`🏠 Bairros encontrados: ${finalData.metadata.totalNeighborhoods}`);
    console.log(`✅ Queries bem-sucedidas: ${successfulQueries}/${mainQueries.length}`);
    console.log('=====================================');

    // Guardar dados consolidados
    await Actor.pushData({
        type: 'FINAL_CONSOLIDATED_DATA',
        ...finalData
    });
    
    // Também guardar dados individuais para facilitar análise
    console.log('💾 A guardar dados individuais...');
    
    const savePromises = [];
    
    // Guardar distritos
    for (const district of finalData.districts) {
        savePromises.push(Actor.pushData({ type: 'district', ...district }));
    }
    
    // Guardar concelhos
    for (const council of finalData.councils) {
        savePromises.push(Actor.pushData({ type: 'council', ...council }));
    }
    
    // Guardar freguesias
    for (const parish of finalData.parishes) {
        savePromises.push(Actor.pushData({ type: 'parish', ...parish }));
    }
    
    // Guardar bairros
    for (const neighborhood of finalData.neighborhoods) {
        savePromises.push(Actor.pushData({ type: 'neighborhood', ...neighborhood }));
    }
    
    // Executar todos os saves em lotes para não sobrecarregar
    const batchSize = 50;
    for (let i = 0; i < savePromises.length; i += batchSize) {
        const batch = savePromises.slice(i, i + batchSize);
        await Promise.all(batch);
        console.log(`💾 Guardado lote ${Math.ceil((i + batchSize) / batchSize)}/${Math.ceil(savePromises.length / batchSize)}`);
    }
    
    console.log('✅ Todos os dados guardados no dataset do Apify');
    
    // Criar um resumo estruturado por distrito
    const structuredSummary = {};
    
    // Organizar por distritos
    for (const district of finalData.districts) {
        structuredSummary[district.name] = {
            district: district,
            councils: [],
            parishes: [],
            neighborhoods: []
        };
    }
    
    // Adicionar concelhos
    for (const council of finalData.councils) {
        for (const parent of council.parents || []) {
            if (parent.detailedLevel === 'district' && structuredSummary[parent.name]) {
                structuredSummary[parent.name].councils.push(council);
            }
        }
    }
    
    // Adicionar freguesias
    for (const parish of finalData.parishes) {
        for (const parent of parish.parents || []) {
            if (parent.detailedLevel === 'district' && structuredSummary[parent.name]) {
                structuredSummary[parent.name].parishes.push(parish);
            }
        }
    }
    
    // Adicionar bairros
    for (const neighborhood of finalData.neighborhoods) {
        for (const parent of neighborhood.parents || []) {
            if (parent.detailedLevel === 'district' && structuredSummary[parent.name]) {
                structuredSummary[parent.name].neighborhoods.push(neighborhood);
            }
        }
    }
    
    // Guardar resumo estruturado
    await Actor.pushData({
        type: 'STRUCTURED_SUMMARY',
        summary: structuredSummary,
        metadata: finalData.metadata
    });
    
    console.log('🗂️ Resumo estruturado criado e guardado');
    console.log(`🎉 EXTRAÇÃO COMPLETA! Total de ${Object.keys(finalData).filter(k => k !== 'metadata').reduce((sum, key) => sum + finalData[key].length, 0)} localizações extraídas`);
});
