import { mutation } from "./_generated/server";

const TANKS = [
  { name: "Carnegie Endowment for International Peace", slug: "carnegie", country: "US", region: "North America", feedUrl: "https://carnegieendowment.org/rss?format=rss", feedType: "RSS" as const, enabled: true, description: "Global think tank promoting international cooperation and US engagement." },
  { name: "Brookings Institution", slug: "brookings", country: "US", region: "North America", feedUrl: "https://www.brookings.edu/feed/", feedType: "RSS" as const, enabled: true, description: "Nonpartisan research addressing public policy challenges." },
  { name: "Center for Strategic and International Studies", slug: "csis", country: "US", region: "North America", feedUrl: "https://www.csis.org/analysis/feed", feedType: "RSS" as const, enabled: true, description: "Bipartisan policy research on global security and prosperity." },
  { name: "International Crisis Group", slug: "icg", country: "Belgium", region: "Europe", feedUrl: "https://www.crisisgroup.org/rss.xml", feedType: "RSS" as const, enabled: true, description: "Independent organization working to prevent wars and shape policies." },
  { name: "Atlantic Council", slug: "atlantic-council", country: "US", region: "North America", feedUrl: "https://www.atlanticcouncil.org/feed/", feedType: "RSS" as const, enabled: true, description: "Shaping the future of transatlantic cooperation." },
  { name: "Council on Foreign Relations", slug: "cfr", country: "US", region: "North America", feedUrl: "https://www.cfr.org/rss", feedType: "RSS" as const, enabled: true, description: "Independent, nonpartisan membership organization and think tank." },
  { name: "International Institute for Strategic Studies", slug: "iiss", country: "UK", region: "Europe", feedUrl: "https://www.iiss.org/online-analysis/rss", feedType: "RSS" as const, enabled: true, description: "Independent source of accurate analysis on military and security issues." },
  { name: "Chatham House", slug: "chatham-house", country: "UK", region: "Europe", feedUrl: "https://www.chathamhouse.org/rss", feedType: "RSS" as const, enabled: true, description: "Royal Institute of International Affairs — global affairs analysis." },
  { name: "Royal United Services Institute", slug: "rusi", country: "UK", region: "Europe", feedUrl: "https://rusi.org/rss.xml", feedType: "RSS" as const, enabled: true, description: "Defence and security think tank founded in 1831." },
  { name: "Wilson Center", slug: "wilson-center", country: "US", region: "North America", feedUrl: "https://www.wilsoncenter.org/rss.xml", feedType: "RSS" as const, enabled: true, description: "Congressional-chartered research and policy forum." },
  { name: "Heritage Foundation", slug: "heritage", country: "US", region: "North America", feedUrl: "https://www.heritage.org/rss", feedType: "RSS" as const, enabled: true, description: "Conservative public policy research organization." },
  { name: "Cato Institute", slug: "cato", country: "US", region: "North America", feedUrl: "https://www.cato.org/rss/blog", feedType: "RSS" as const, enabled: true, description: "Public policy research foundation — libertarian perspective." },
  { name: "Peterson Institute for International Economics", slug: "piie", country: "US", region: "North America", feedUrl: "https://www.piie.com/rss.xml", feedType: "RSS" as const, enabled: true, description: "Nonprofit institution devoted to international economic policy." },
  { name: "German Council on Foreign Relations", slug: "dgap", country: "Germany", region: "Europe", feedUrl: "https://www.dgap.org/en/rss", feedType: "RSS" as const, enabled: true, description: "Germany's leading foreign policy think tank." },
  { name: "Middle East Institute", slug: "mei", country: "US", region: "Middle East", feedUrl: "https://www.mei.edu/feed", feedType: "RSS" as const, enabled: true, description: "Promoting the study of the Middle East in the US." },
  { name: "European Council on Foreign Relations", slug: "ecfr", country: "UK", region: "Europe", feedUrl: "https://ecfr.eu/rss", feedType: "RSS" as const, enabled: true, description: "Pan-European think tank on EU foreign policy." },
  { name: "Stimson Center", slug: "stimson", country: "US", region: "North America", feedUrl: "https://www.stimson.org/rss.xml", feedType: "RSS" as const, enabled: true, description: "Nonpartisan global security think tank." },
  { name: "Stiftung Wissenschaft und Politik", slug: "swp", country: "Germany", region: "Europe", feedUrl: "https://www.swp-berlin.org/en/rss", feedType: "RSS" as const, enabled: true, description: "German Institute for International and Security Affairs." },
  { name: "Institut français des relations internationales", slug: "ifri", country: "France", region: "Europe", feedUrl: "https://www.ifri.org/rss", feedType: "RSS" as const, enabled: true, description: "France's leading independent foreign policy think tank." },
  { name: "Arab Center Washington DC", slug: "arab-center", country: "US", region: "Middle East", feedUrl: "https://arabcenterdc.org/feed/", feedType: "RSS" as const, enabled: true, description: "Research and policy analysis on Arab and Middle East affairs." },
  { name: "German Marshall Fund", slug: "gmf", country: "US", region: "Europe", feedUrl: "https://www.gmfus.org/feed", feedType: "RSS" as const, enabled: true, description: "Strengthening transatlantic cooperation on global affairs." },
  { name: "Hoover Institution", slug: "hoover", country: "US", region: "North America", feedUrl: "https://www.hoover.org/feed", feedType: "RSS" as const, enabled: true, description: "Public policy research and think tank at Stanford University." },
  { name: "RAND Corporation", slug: "rand", country: "US", region: "North America", feedUrl: "https://www.rand.org/blog/policy-currents.rss", feedType: "RSS" as const, enabled: true, description: "Global policy analysis and research organization." },
];

export const seedIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("thinkTanks").collect();
    if (existing.length > 0) return { seeded: false };
    for (const t of TANKS) {
      await ctx.db.insert("thinkTanks", { ...t, lastFetched: undefined });
    }
    return { seeded: true, count: TANKS.length };
  },
});
