import axios from 'axios';

// create a cache for the top ETH tokens
// let eth_token_index

// the header config for axios calls to the cmc api
const config = {
    headers: { 
        'X-CMC_PRO_API_KEY': '45be1879-9958-4adb-8ff3-75edbe7eabc5' 
    }
};
// how long interface Index and AssetRisk have until refresh API call is needed
const update_interval = 60000;   // 60s
let index: Index = {};

const risk_weights: Map<SelectedRiskPlan, RiskWeights> = new Map([
    ["conservative-a", {
        market_cap_weight: 0.6,
        liquidity_weight: 0.3,
        volatility_weight: 0.1,
    }],
    ["conservative-b", {
        market_cap_weight: 0.5,
        liquidity_weight: 0.4,
        volatility_weight: 0.1,
    }],
    ["conservative-c", {
        market_cap_weight: 0.5,
        liquidity_weight: 0.3,
        volatility_weight: 0.2,
    }],
    ["moderate-a", {
        market_cap_weight: 0.4,
        liquidity_weight : 0.3,
        volatility_weight: 0.3,
    }],
    ["moderate-b", {
        market_cap_weight: 0.33,
        liquidity_weight : 0.34,
        volatility_weight: 0.33,
    }],
    ["moderate-c", {
        market_cap_weight: 0.3,
        liquidity_weight: 0.3,
        volatility_weight: 0.4,
    }],
    ["aggressive-a", {
        market_cap_weight: 0.3,
        liquidity_weight : 0.3,
        volatility_weight: 0.4,
    }],
    ["aggressive-b", {
        market_cap_weight: 0.2,
        liquidity_weight: 0.3,
        volatility_weight: 0.5,
    }],
    ["aggressive-c", {
        market_cap_weight: 0.1,
        liquidity_weight: 0.3,
        volatility_weight: 0.6,
    }]
]);

async function updateIndexBySymbol(symbol: string) {
    const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest';
    let update = await axios.get(url, config).then((res: any) => {
        let assets: CmcTokenData[] = res.data.data.filter((x: CmcTokenData) => x.platform && x.platform['symbol'] == symbol);
        assets.unshift(res.data.data[1]);
        // console.log('these are the assets for the symbol', symbol, {assets});
        // console.log(assets[0]);
        // console.log(assets[9].quote);
        let last_updated = new Date().getTime();
        // update index
        if (assets && assets.length) {
            index[symbol] = { assets, last_updated };
            // console.log('Index updated.', symbol, 'added');
            return true;
        }
        else {
            console.log('No asset found with symbol', symbol);
            return false;
        }
    }).catch((err: any) => {
        console.log({err});
        return false;
    });
    if (update) return true;
    else return false;
}

async function calculateMarketCap(index_symbol: string, token_symbol: string): Promise<number> {
    return new Promise(async (resolve, reject) => {
        let _index = index[index_symbol];
        // if (!_index || (_index) && (new Date().getTime() - _index.last_updated <= update_interval)) {
        //     await updateIndexBySymbol(index_symbol);
        // }
        let found_index = _index!.assets.filter(x => x.symbol === token_symbol);
        // console.log({ found_index });
        if (!found_index) {
            console.log('Token not found on network as provided');
            reject("Token not found on network as provided");
            return;
        }
        resolve(found_index[0].quote.USD.market_cap);
    });
}

function calculateVolatility(prices: number[], time_interval_in_mins: number): { volatility: number, implied_volatility: number } {
    // todo ask enzo about risk and volatility between implied risk, beta coefficient, sharpe ratio, santino ratio and var measure.

    // Calculate the mean (average) price of the cryptocurrency
    let sum = 0;
    for (let i = 0; i < prices.length; i++) {
      sum += prices[i];
    }
    let mean = sum / prices.length;
  
    // Calculate the variance of the price data
    let variance = 0;
    for (let i = 0; i < prices.length; i++) {
      let diff = prices[i] - mean;
      variance += diff * diff;
    }
  
    // Calculate the standard deviation (volatility) of the price data
    variance /= prices.length;
    let volatility = Math.sqrt(variance);
    // Math.sqrt(THE_NUMBER_I_AM_SQ_ROOTING)
    // Implied risk is sd * sqrt(time_int)
    const TIME_INTERVAL = time_interval_in_mins; 
    const TRADING_DAYS_PER_YEAR = 252; 
    // get implied volatility
    let implied_volatility = volatility * Math.sqrt(TIME_INTERVAL / TRADING_DAYS_PER_YEAR);
    // console.log({ volatility, implied_volatility })
    return { volatility, implied_volatility };
}

async function calculateLiquidity(index_symbol: string, token_symbol: string) {
    // return new Promise((resolve) => {
        // TODO make this more in depth. this is super basic
        // TODO Sharpe Ratio
        // TODO Santino Ratio
        // TODO VaR (Value at Risk)
        // TODO Beta Coefficient
        // TODO Order Book depth

        let _index = index[index_symbol];
        // if (!_index || (_index && new Date().getTime() - _index.last_updated <= update_interval)) {
        //    await updateIndexBySymbol(index_symbol);
        // }
        let found_index = _index!.assets.filter(x => x.symbol === token_symbol);
        if (!found_index) {
            console.log('Token not found on network as provided');
            return(0);
        }
        return(found_index[0].quote.USD.volume_24h);
    // });
}

// function calculateOrderBookDepth(orders: Order[]): number {
//     // Group orders by price level
//     let orderGroups = new Map<number, Order[]>();
//     for (let i = 0; i < orders.length; i++) {
//       let order = orders[i];
//       let price = order.price;
//       if (!orderGroups.has(price)) {
//         orderGroups.set(price, []);
//       }
//       orderGroups.get(price)!.push(order);
//     }
  
//     // Calculate the depth of the order book
//     let depth = 0;
//     orderGroups.forEach((orders, price) => {
//       let volume = 0;
//       for (let i = 0; i < orders.length; i++) {
//         volume += orders[i].volume;
//       }
//       depth += volume;
//     });
  
//     return depth;
// }
  
function calculateRisk(index_symbol: string, token_symbol: string, risk_plan: SelectedRiskPlan): Promise<AssetRisk> {
    return new Promise(async (resolve, reject) => {
        let plan = risk_weights.get(risk_plan);
        let err_msg;
        if (!plan) {
            err_msg = 'no plan in the map object'
            reject(err_msg);
            return;
        }
        let { market_cap_weight, liquidity_weight, volatility_weight } = plan;

        let time_interval_in_mins: number = 30;
        // todo change beyond a 24 hour calculation
        let found_asset = index[index_symbol].assets.find(x => x.symbol === token_symbol);
        if (!found_asset) {
            err_msg = 'No asset found';
            reject(err_msg);
            return;
        }

        let todays_price = found_asset.quote.USD.price;
        let yesterdays_price = (): number => {
            let percent = found_asset!.quote.USD.percent_change_24h;
            let price = todays_price * 100 / (100 + percent);
            return price;
        }
        // todo END OF TODO: change beyond a 24 hour calc (api upgrade/change)
        let { volatility } = calculateVolatility([yesterdays_price(), todays_price], time_interval_in_mins);
        let market_cap = await calculateMarketCap(index_symbol, token_symbol);
        let liquidity = await calculateLiquidity(index_symbol, token_symbol);
        let score: number = (market_cap * market_cap_weight) + (volatility * volatility_weight) + (liquidity * liquidity_weight);
        resolve({
            index_symbol,
            token_symbol,
            volatility,
            market_cap,
            liquidity,
            score,
            risk_plan,
            last_updated: new Date().getTime()
        });
    });  
}


updateIndexBySymbol('ETH').then(async () => {
    // console.log(index['ETH']);
        // let proms = [
        //     calculateRisk('ETH', 'SHIB', 'conservative-a'), 
        //     calculateRisk('ETH', 'USDT', 'conservative-a'), 
        //     calculateRisk('ETH', 'DAI', 'conservative-a'), 
        //     calculateRisk('ETH', 'SHIB', 'moderate-a'), 
        //     calculateRisk('ETH', 'USDT', 'moderate-a'), 
        //     calculateRisk('ETH', 'DAI', 'moderate-a'), 
        //     calculateRisk('ETH', 'SHIB', 'aggressive-a'),
        //     calculateRisk('ETH', 'USDT', 'aggressive-a'),
        //     calculateRisk('ETH', 'DAI', 'aggressive-a')
        // ];
        // let plans = await Promise.all(proms);
        // console.log("Risk Plans:", plans);
        // for(let plan_a of plans) {
        //     for(let plan_b of plans) {
        //         let sum = plan_a.score - plan_b.score;
        //         console.log(`${plan_a.risk_plan} - ${plan_b.risk_plan}`, sum);;
        //     }
    // }
    let conservative_scores: { symbol: string, score: number, risk_plan: SelectedRiskPlan }[] = [];
    let moderate_scores: { symbol: string, score: number, risk_plan: SelectedRiskPlan }[] = [];
    let aggressive_scores: { symbol: string, score: number, risk_plan: SelectedRiskPlan }[] = [];
    for (let i = 0; i < index['ETH'].assets.length; i++) {
        // get all the conservative scores for all of the tokens
        let c_risks: SelectedRiskPlan[] = ["conservative-a", "conservative-b", "conservative-c"];
        for (let c_risk of c_risks) {
            let symbol = index['ETH'].assets[i].symbol;
            let score = await calculateRisk('ETH', symbol, c_risk);
            let c_score = {
                symbol,
                score: score.score,
                risk_plan: c_risk
            }
            conservative_scores.push(c_score);
        }
        // get all the moderate scores for all of the tokens
        let m_risks: SelectedRiskPlan[] = ["moderate-a", "moderate-b", "moderate-c"];
        for (let m_risk of m_risks) {
            let symbol = index['ETH'].assets[i].symbol;
            let score = await calculateRisk('ETH', symbol, m_risk);
            let m_score = {
                symbol,
                score: score.score,
                risk_plan: m_risk
            }
            moderate_scores.push(m_score);
        }
        // get all the aggressive scores for all of the tokens
        let a_risks: SelectedRiskPlan[] = ["aggressive-a", "aggressive-b", "aggressive-c"];
        for (let a_risk of a_risks) {
            let symbol = index['ETH'].assets[i].symbol;
            let score = await calculateRisk('ETH', symbol, a_risk);
            let a_score = {
                symbol,
                score: score.score,
                risk_plan: a_risk
            }
            aggressive_scores.push(a_score);
        }
    }
    // sort the scores highest to lowest
    conservative_scores.sort((a, b) => {
        return b.score - a.score
    });
    moderate_scores.sort((a, b) => {
        return b.score - a.score
    });
    aggressive_scores.sort((a, b) => {
        return b.score - a.score
    });
    // now get the top scores of the conservative filtered by modifier then sort by decending scores, limit to top 10
    let top_ca_scores = conservative_scores.filter(x => x.risk_plan == 'conservative-a');
    top_ca_scores.sort((a, b) => {
        return b.score-a.score;
    });
    // top_ca_scores.length = 10;
    let top_cb_scores = conservative_scores.filter(x => x.risk_plan == 'conservative-b');
    top_cb_scores.sort((a, b) => {
        return b.score-a.score;
    });
    // top_cb_scores.length = 10;
    let top_cc_scores = conservative_scores.filter(x => x.risk_plan == 'conservative-c');
    top_cc_scores.sort((a, b) => {
        return b.score-a.score;
    });
    // top_cc_scores.length = 10;
    // now get the top scores of the moderate filtered by modifier
    let top_ma_scores = moderate_scores.filter(x => x.risk_plan == 'moderate-a');
    top_ma_scores.sort((a, b) => {
        return b.score-a.score;
    });
    // top_ma_scores.length = 10;
    let top_mb_scores = moderate_scores.filter(x => x.risk_plan == 'moderate-b');
    top_mb_scores.sort((a, b) => {
        return b.score-a.score;
    });
    // top_mb_scores.length = 10;
    let top_mc_scores = moderate_scores.filter(x => x.risk_plan == 'moderate-c');
    top_mc_scores.sort((a, b) => {
        return b.score-a.score;
    });
    // top_mc_scores.length = 10;
    // now get the top scores of the aggressive filtered by modifier
    let top_aa_scores = aggressive_scores.filter(x => x.risk_plan == 'aggressive-a');
    top_aa_scores.sort((a, b) => {
        return b.score-a.score;
    });
    // top_aa_scores.length = 10;
    let top_ab_scores = aggressive_scores.filter(x => x.risk_plan == 'aggressive-b');
    top_ab_scores.sort((a, b) => {
        return b.score-a.score;
    });
    // top_ab_scores.length = 10;
    let top_ac_scores = aggressive_scores.filter(x => x.risk_plan == 'aggressive-c');
    top_ac_scores.sort((a, b) => {
        return b.score-a.score;
    });
    // top_ac_scores.length = 10;
    // output scores
    console.log({ top_ca_scores });
    console.log({ top_cb_scores });
    console.log({ top_cc_scores });
    console.log({ top_ma_scores });
    console.log({ top_mb_scores });
    console.log({ top_mc_scores });
    console.log({ top_aa_scores });
    console.log({ top_ab_scores });
    console.log({ top_ac_scores });    
    // console.log('THIS IS THE LENGTH OF INDEX[ETH].assets', index['ETH'].assets.length);
}).catch(err => {
    console.log({ err });
});


// the key will be the symbol of the chain. example: 'ETH'
interface Index {
    [key: string]: {
        assets: CmcTokenData[];
        last_updated: number;
    }
}

interface Order {
    price: number;
    volume: number;
}

interface CmcTokenData {
    id: number;
    name: string;
    symbol: string;
    slug: string;
    num_market_pairs: number;
    date_added: string;
    tags: string[];
    max_supply: number | null;
    circulating_supply: number;
    total_supply: number;
    platform?: {
        id: number;
        name: string;
        symbol: string;
        slug: string;
        token_address: string
    }
    cmc_rank: number;
    quote: { USD: TokenQuote }
}

interface TokenQuote {
    price: number;
    volume_24h: number;
    volume_change_24h: number;
    percent_change_1h: number;
    percent_change_24h: number;
    percent_change_7d: number;
    percent_change_30d: number;
    percent_change_60d: number;
    percent_change_90d: number;
    market_cap: number;
    market_cap_dominanace: number;
    fully_diluted_market_cap: number;
    tvl: any | null;
    last_updated: string;
}

interface RiskIndex {
    [key: string]: {
        assets: AssetRisk[];
        last_updated: number;
    }
}

interface AssetRisk {
    index_symbol: string;
    token_symbol: string;
    volatility: number;
    liquidity: number;
    market_cap: number;
    score: number;
    risk_plan: SelectedRiskPlan;
    last_updated: number;
}

interface RiskWeights {
    market_cap_weight: number;
    liquidity_weight: number;
    volatility_weight: number;
}

type RiskPlan = 'conservative' | 'moderate' | 'aggressive';
// for now, a = conservative b = moderate c = aggressive
type RiskModifer = 'a' | 'b' | 'c';
type SelectedRiskPlan = `${RiskPlan}-${RiskModifer}`;