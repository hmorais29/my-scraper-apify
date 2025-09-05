// locationMatcher.js

/**
 * Sistema avançado de matching de localizações
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
     * Calcula o score de matching com lógica melhorada
     */
    static calculateMatchScore(locationQuery, location, allQueries) {
        const normalizedQuery = this.normalizeText(locationQuery);
        const normalizedName = this.normalizeText(location.name);
        const normalizedFullName = this.normalizeText(location.fullName || '');
        
        let score = 0;
        let matchType = '';

        // 1. Match exato no nome (prioridade máxima)
        if (normalizedName === normalizedQuery) {
            score = 10000 * location.priority;
            matchType = 'EXATO';
        }
        // 2. Query contém TODO o nome da localização (muito bom)
        else if (normalizedQuery.includes(normalizedName) && normalizedName.length > 3) {
            score = 8000 * location.priority * (normalizedName.length / normalizedQuery.length);
            matchType = 'QUERY_CONTÉM_NOME';
        }
        // 3. Nome da localização contém a query (bom)
        else if (normalizedName.includes(normalizedQuery) && normalizedQuery.length > 3) {
            score = 6000 * location.priority * (normalizedQuery.length / normalizedName.length);
            matchType = 'NOME_CONTÉM_QUERY';
        }
        // 4. Match no fullName
        else if (normalizedFullName.includes(normalizedQuery)) {
            score = 4000 * location.priority;
            matchType = 'FULLNAME';
        }
        // 5. Fuzzy matching para typos
        else {
            const distance = this.levenshteinDistance(normalizedName, normalizedQuery);
            const maxLen = Math.max(normalizedName.length, normalizedQuery.length);
            const similarity = 1 - (distance / maxLen);
            
            if (similarity > 0.7) { // 70% de similaridade
                score = 2000 * location.priority * similarity;
                matchType = `FUZZY_${(similarity * 100).toFixed(0)}%`;
            }
        }

        // BONUS ESPECIAL: Para "Santo António dos Cavaleiros" quando a query tem múltiplas palavras
        if (score > 0 && allQueries.length > 1) {
            // Calcular quantas palavras da query estão no nome da localização
            const queryWords = allQueries.map(q => this.normalizeText(q));
            const wordsInLocation = queryWords.filter(word => 
                normalizedName.includes(word) || normalizedFullName.includes(word)
            ).length;
            
            if (wordsInLocation > 1) {
                const multiWordBonus = Math.pow(1.5, wordsInLocation - 1); // Bonus exponencial
                score *= multiWordBonus;
                matchType += `_MULTI(${wordsInLocation}words)`;
                
                console.log(`🎯 BONUS multi-palavra: ${location.name} - ${wordsInLocation} palavras matched - Bonus: ${multiWordBonus.toFixed(2)}x`);
            }
        }

        // BONUS EXTRA: Para localizações mais específicas (neighborhoods > parishes > councils)
        if (score > 0) {
            const specificityBonus = {
                'neighborhood': 1.2,
                'parish': 1.1,
                'council': 1.0,
                'district': 0.9
            };
            
            const bonus = specificityBonus[location.level] || 1.0;
            score *= bonus;
        }

        return { score, matchType, queryWords: allQueries.length };
    }

    /**
     * Encontra a melhor localização para uma query
     */
    static findBestMatch(locationQueries, locationsData) {
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

        // Criar lista unificada com prioridades
        const allLocations = [
            ...allLocationArrays.neighborhoods?.map(n => ({...n, priority: 5, type: 'neighborhood', level: 'neighborhood'})) || [],
            ...allLocationArrays.parishes?.map(p => ({...p, priority: 4, type: 'parish', level: 'parish'})) || [],
            ...allLocationArrays.councils?.map(c => ({...c, priority: 3, type: 'council', level: 'council'})) || [],
            ...allLocationArrays.districts?.map(d => ({...d, priority: 2, type: 'district', level: 'district'})) || []
        ];

        console.log(`📊 Total de localizações disponíveis: ${allLocations.length}`);

        let bestMatch = null;
        let bestScore = 0;
        let allMatches = []; // Para debug

        // Para cada query de localização
        for (const locationQuery of locationQueries) {
            console.log(`🔍 A processar: "${locationQuery}"`);

            // Para cada localização disponível
            for (const location of allLocations) {
                const matchResult = this.calculateMatchScore(locationQuery, location, locationQueries);
                
                if (matchResult.score > 0) {
                    allMatches.push({
                        location: location.name,
                        score: matchResult.score,
                        type: matchResult.matchType,
                        level: location.level,
                        query: locationQuery
                    });
                    
                    console.log(`🎯 ${matchResult.matchType}: ${location.name} (${location.level}) - Score: ${matchResult.score.toFixed(0)}`);
                }

                if (matchResult.score > bestScore) {
                    bestScore = matchResult.score;
                    bestMatch = location;
                }
            }
        }

        // Mostrar top 5 matches para debug
        const top5 = allMatches
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        
        console.log(`🏆 TOP 5 MATCHES:`);
        top5.forEach((match, i) => {
            console.log(`  ${i + 1}. ${match.location} (${match.level}) - ${match.score.toFixed(0)} - ${match.type} - Query: "${match.query}"`);
        });

        if (bestMatch) {
            console.log(`✅ MELHOR MATCH: ${bestMatch.name} (${bestMatch.level}) - Score: ${bestScore.toFixed(0)}`);
            console.log(`📍 FullName: ${bestMatch.fullName}`);
            console.log(`🆔 ID: ${bestMatch.id}`);
            return bestMatch;
        }

        console.log('❌ Nenhuma localização encontrada');
        return null;
    }

    /**
     * Encontra matches alternativos se o principal falhar
     */
    static findAlternativeMatches(locationQueries, locationsData, limit = 3) {
        console.log(`🔍 A procurar matches alternativos...`);

        // Similar à função principal mas retorna múltiplos resultados
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
            ...allLocationArrays.neighborhoods?.map(n => ({...n, priority: 5, type: 'neighborhood', level: 'neighborhood'})) || [],
            ...allLocationArrays.parishes?.map(p => ({...p, priority: 4, type: 'parish', level: 'parish'})) || [],
            ...allLocationArrays.councils?.map(c => ({...c, priority: 3, type: 'council', level: 'council'})) || [],
            ...allLocationArrays.districts?.map(d => ({...d, priority: 2, type: 'district', level: 'district'})) || []
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

        console.log(`📋 ${uniqueMatches.length} matches alternativos encontrados`);
        return uniqueMatches;
    }
}
