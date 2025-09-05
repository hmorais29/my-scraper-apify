// locationMatcher.js - VERSÃO CORRIGIDA

/**
 * Sistema avançado de matching de localizações
 * CORRIGIDO: Prioridade correta para match exato do name
 */
export class LocationMatcher {

    /**
     * Normaliza texto para comparação
     */
    static normalizeText(text) {
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Calcula distância de Levenshtein para fuzzy matching
     */
    static levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * CORRIGIDO: Calcula o score de matching com prioridade no name exato
     */
    static calculateMatchScore(locationQuery, location, allQueries) {
        const normalizedQuery = this.normalizeText(locationQuery);
        const normalizedName = this.normalizeText(location.name);
        const normalizedFullName = this.normalizeText(location.fullName || '');
        
        let score = 0;
        let matchType = '';

        // PRIORIDADES HIERÁRQUICAS CORRETAS (mais específico = mais prioridade)
        const hierarchyPriority = {
            'neighborhood': 10,  // Bairro/Zona - MÁXIMA prioridade
            'parish': 8,         // Freguesia
            'council': 6,        // Concelho  
            'district': 4        // Distrito - menor prioridade
        };
        
        const basePriority = hierarchyPriority[location.level] || 1;
        console.log(`🏷️  ${location.name} (${location.level}) - Prioridade base: ${basePriority}`);

        // 1. MATCH EXATO NO NAME (prioridade absoluta)
        if (normalizedName === normalizedQuery) {
            score = 100000 * basePriority; // Score muito alto para match exato
            matchType = 'NAME_EXATO';
            console.log(`🎯 MATCH EXATO: "${location.name}" - Score: ${score.toFixed(0)}`);
        }
        // 2. Query contém TODO o nome da localização (muito bom)
        else if (normalizedQuery.includes(normalizedName) && normalizedName.length > 3) {
            score = 50000 * basePriority * (normalizedName.length / normalizedQuery.length);
            matchType = 'QUERY_CONTÉM_NOME';
        }
        // 3. Nome da localização contém a query (bom, mas menor prioridade)
        else if (normalizedName.includes(normalizedQuery) && normalizedQuery.length > 3) {
            score = 25000 * basePriority * (normalizedQuery.length / normalizedName.length);
            matchType = 'NOME_CONTÉM_QUERY';
        }
        // 4. Match no fullName (menor prioridade)
        else if (normalizedFullName.includes(normalizedQuery)) {
            score = 10000 * basePriority;
            matchType = 'FULLNAME';
        }
        // 5. Fuzzy matching para typos (última opção)
        else {
            const distance = this.levenshteinDistance(normalizedName, normalizedQuery);
            const maxLen = Math.max(normalizedName.length, normalizedQuery.length);
            const similarity = 1 - (distance / maxLen);
            
            if (similarity > 0.7) { // 70% de similaridade
                score = 5000 * basePriority * similarity;
                matchType = `FUZZY_${(similarity * 100).toFixed(0)}%`;
            }
        }

        // BONUS MULTI-PALAVRA: Quando a query tem múltiplas palavras que fazem match
        if (score > 0 && allQueries.length > 1) {
            const queryWords = allQueries.map(q => this.normalizeText(q));
            const wordsInName = queryWords.filter(word => normalizedName.includes(word)).length;
            const wordsInFullName = queryWords.filter(word => normalizedFullName.includes(word)).length;
            const totalWordsMatched = Math.max(wordsInName, wordsInFullName);
            
            if (totalWordsMatched > 1) {
                const multiWordBonus = Math.pow(1.8, totalWordsMatched - 1);
                score *= multiWordBonus;
                matchType += `_MULTI(${totalWordsMatched}w)`;
                console.log(`🎯 BONUS multi-palavra: ${location.name} - ${totalWordsMatched} palavras - Bonus: ${multiWordBonus.toFixed(2)}x`);
            }
        }

        // PENALIZAÇÃO: Para evitar matches muito genéricos
        if (normalizedName.length <= 3 && matchType !== 'NAME_EXATO') {
            score *= 0.5; // Penaliza nomes muito curtos
            matchType += '_CURTO';
        }

        return { 
            score, 
            matchType, 
            queryWords: allQueries.length,
            hierarchy: location.level,
            name: location.name 
        };
    }

    /**
     * CORRIGIDO: Encontra a melhor localização priorizando name exato
     */
    static findBestMatch(locationQueries, locationsData) {
        console.log(`\n🔍 === LOCATION MATCHING ===`);
        console.log(`🔍 A procurar melhor match para: [${locationQueries.join(', ')}]`);

        // Preparar dados de localizações
        let allLocationArrays = {};
        
        if (locationsData.districts && locationsData.councils) {
            allLocationArrays = locationsData;
        } else if (Array.isArray(locationsData) && locationsData.length > 0) {
            const consolidatedData = locationsData.find(item => item.type === 'FINAL_CONSOLIDATED_DATA');
            if (consolidatedData) {
                allLocationArrays = consolidatedData;
            } else {
                console.log('❌ Dados de localização inválidos');
                return null;
            }
        } else {
            console.log('❌ Estrutura de dados de localização não reconhecida');
            return null;
        }

        // Criar lista unificada com prioridades CORRETAS
        const allLocations = [
            ...allLocationArrays.neighborhoods?.map(n => ({...n, level: 'neighborhood'})) || [],
            ...allLocationArrays.parishes?.map(p => ({...p, level: 'parish'})) || [],
            ...allLocationArrays.councils?.map(c => ({...c, level: 'council'})) || [],
            ...allLocationArrays.districts?.map(d => ({...d, level: 'district'})) || []
        ];

        console.log(`📊 Total de localizações: ${allLocations.length}`);
        console.log(`   - Neighborhoods: ${allLocationArrays.neighborhoods?.length || 0}`);
        console.log(`   - Parishes: ${allLocationArrays.parishes?.length || 0}`);
        console.log(`   - Councils: ${allLocationArrays.councils?.length || 0}`);
        console.log(`   - Districts: ${allLocationArrays.districts?.length || 0}`);

        let bestMatch = null;
        let bestScore = 0;
        let allMatches = [];

        // Para cada query de localização
        for (const locationQuery of locationQueries) {
            console.log(`\n🔍 A processar query: "${locationQuery}"`);

            // Para cada localização disponível
            for (const location of allLocations) {
                const matchResult = this.calculateMatchScore(locationQuery, location, locationQueries);
                
                if (matchResult.score > 0) {
                    allMatches.push({
                        location: location.name,
                        fullName: location.fullName,
                        id: location.id,
                        score: matchResult.score,
                        type: matchResult.matchType,
                        level: location.level,
                        query: locationQuery,
                        locationObj: location
                    });
                    
                    if (matchResult.score > bestScore) {
                        bestScore = matchResult.score;
                        bestMatch = location;
                        console.log(`🏆 NOVO MELHOR: ${location.name} (${location.level}) - Score: ${matchResult.score.toFixed(0)} - ${matchResult.matchType}`);
                    }
                }
            }
        }

        // Mostrar top 10 matches para debug
        const topMatches = allMatches
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        
        console.log(`\n🏆 === TOP 10 MATCHES ===`);
        topMatches.forEach((match, i) => {
            const isWinner = i === 0 ? '👑 ' : `${i + 1}. `;
            console.log(`${isWinner}${match.location} (${match.level}) - Score: ${match.score.toFixed(0)} - ${match.type}`);
            console.log(`    Query: "${match.query}" | ID: ${match.id}`);
            if (i === 0 && match.fullName) {
                console.log(`    FullName: ${match.fullName}`);
            }
        });

        if (bestMatch) {
            console.log(`\n✅ === RESULTADO FINAL ===`);
            console.log(`🏆 VENCEDOR: ${bestMatch.name} (${bestMatch.level})`);
            console.log(`📍 FullName: ${bestMatch.fullName}`);
            console.log(`🆔 ID: ${bestMatch.id}`);
            console.log(`📊 Score Final: ${bestScore.toFixed(0)}`);
            
            // Validar se o ID está correto para o URL
            if (bestMatch.id && bestMatch.id.includes('/')) {
                console.log(`🌐 URL será: https://www.imovirtual.com/pt/resultados/comprar/apartamento/${bestMatch.id}`);
            }
            
            return bestMatch;
        }

        console.log('\n❌ === NENHUM MATCH ENCONTRADO ===');
        return null;
    }

    /**
     * CORRIGIDO: Encontra matches alternativos com melhor hierarquia
     */
    static findAlternativeMatches(locationQueries, locationsData, limit = 5) {
        console.log(`\n🔍 === PROCURAR ALTERNATIVAS ===`);

        // Usar o mesmo sistema da função principal
        let allLocationArrays = {};
        
        if (locationsData.districts && locationsData.councils) {
            allLocationArrays = locationsData;
        } else if (Array.isArray(locationsData) && locationsData.length > 0) {
            const consolidatedData = locationsData.find(item => item.type === 'FINAL_CONSOLIDATED_DATA');
            if (consolidatedData) {
                allLocationArrays = consolidatedData;
            } else {
                return [];
            }
        } else {
            return [];
        }

        const allLocations = [
            ...allLocationArrays.neighborhoods?.map(n => ({...n, level: 'neighborhood'})) || [],
            ...allLocationArrays.parishes?.map(p => ({...p, level: 'parish'})) || [],
            ...allLocationArrays.councils?.map(c => ({...c, level: 'council'})) || [],
            ...allLocationArrays.districts?.map(d => ({...d, level: 'district'})) || []
        ];

        const matches = [];

        for (const locationQuery of locationQueries) {
            for (const location of allLocations) {
                const matchResult = this.calculateMatchScore(locationQuery, location, locationQueries);
                
                if (matchResult.score > 0) {
                    matches.push({ location, score: matchResult.score });
                }
            }
        }

        // Ordenar por score e remover duplicados
        const uniqueMatches = Array.from(
            new Map(matches.map(m => [m.location.id, m])).values()
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(m => m.location);

        console.log(`📋 ${uniqueMatches.length} matches alternativos encontrados:`);
        uniqueMatches.forEach((match, i) => {
            console.log(`  ${i + 1}. ${match.name} (${match.level}) - ID: ${match.id}`);
        });

        return uniqueMatches;
    }

    /**
     * NOVA: Função para debug de uma localização específica
     */
    static debugLocationMatch(locationQuery, specificLocationName, locationsData) {
        console.log(`\n🐛 === DEBUG MATCH ESPECÍFICO ===`);
        console.log(`🔍 Query: "${locationQuery}"`);
        console.log(`🎯 Localização específica: "${specificLocationName}"`);

        const allLocations = this.getAllLocationsFromData(locationsData);
        const targetLocation = allLocations.find(loc => 
            this.normalizeText(loc.name) === this.normalizeText(specificLocationName)
        );

        if (!targetLocation) {
            console.log(`❌ Localização "${specificLocationName}" não encontrada nos dados`);
            return null;
        }

        const result = this.calculateMatchScore(locationQuery, targetLocation, [locationQuery]);
        
        console.log(`📊 Resultado do match:`);
        console.log(`   - Score: ${result.score.toFixed(0)}`);
        console.log(`   - Tipo: ${result.matchType}`);
        console.log(`   - Hierarquia: ${targetLocation.level}`);
        console.log(`   - ID: ${targetLocation.id}`);
        console.log(`   - FullName: ${targetLocation.fullName}`);

        return result;
    }

    /**
     * Helper para extrair todas as localizações dos dados
     */
    static getAllLocationsFromData(locationsData) {
        let allLocationArrays = {};
        
        if (locationsData.districts && locationsData.councils) {
            allLocationArrays = locationsData;
        } else if (Array.isArray(locationsData) && locationsData.length > 0) {
            const consolidatedData = locationsData.find(item => item.type === 'FINAL_CONSOLIDATED_DATA');
            if (consolidatedData) {
                allLocationArrays = consolidatedData;
            } else {
                return [];
            }
        } else {
            return [];
        }

        return [
            ...allLocationArrays.neighborhoods?.map(n => ({...n, level: 'neighborhood'})) || [],
            ...allLocationArrays.parishes?.map(p => ({...p, level: 'parish'})) || [],
            ...allLocationArrays.councils?.map(c => ({...c, level: 'council'})) || [],
            ...allLocationArrays.districts?.map(d => ({...d, level: 'district'})) || []
        ];
    }
}
