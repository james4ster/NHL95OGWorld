import sheetsGet from "./sheetsGet.js"

const col_start = "G"
const col_end = "N"

async function assembleRawScoring({sheets, spreadsheetId, range, romData}){

    const { allGoalsScored } = romData.data
    const rawScoringData = [];
    const rawScoringNextRowResponse = await await sheetsGet({sheets, spreadsheetId, range}) 
    const rawScoringColH =  rawScoringNextRowResponse.data.values || [] // Return the unique IDs
    const rawScoringNextFreeRowNumber = rawScoringColH.length + 1;

    allGoalsScored.forEach(goal => {
    const tempArray = [];
    for (let goalStat in goal){
        tempArray.push(goal[goalStat])
    }
    rawScoringData.push(tempArray)
    })
    const rawScoringEntries = {
    range: `RawScoring!${col_start}${rawScoringNextFreeRowNumber}:${col_end}${rawScoringNextFreeRowNumber + rawScoringData.length-1}`,
    resource: {
        values: [...rawScoringData]
    }
    }

    return { rawScoringEntries }
}

export default assembleRawScoring;