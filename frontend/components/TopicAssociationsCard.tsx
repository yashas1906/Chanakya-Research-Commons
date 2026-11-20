"use client";

import React, { useState, useEffect } from "react";

interface BundleItem {
  bundle: string[];
  support: number;
  support_pct: number;
  paper_count: number;
  length: number;
}

interface RuleItem {
  antecedents: string[];
  consequents: string[];
  support: number;
  confidence: number;
  confidence_pct: number;
  lift: number;
  conviction: number | string;
}

interface ClusterItem {
  cluster_id: string;
  cluster_index: number;
  archetype_title: string;
  size: number;
  percentage: number;
  mean_metrics: {
    total_publications: number;
    total_citations: number;
    avg_coauthors: number;
    avg_pagerank: number;
    topic_breadth: number;
  };
  prominent_traits: string[];
  department_distribution: Record<string, number>;
}

interface ClusterRule {
  cluster: string;
  traits: string[];
  support: number;
  confidence: number;
  lift: number;
}

const SCHOOL_OPTIONS = [
  { value: "ALL", label: "All University Schools (Institutional Aggregation)" },
  { value: "School of Technology & AI", label: "School of Technology & AI (CS, AI, ECE)" },
  { value: "School of Biosciences", label: "School of Biosciences (Biotech, Genomics)" },
  { value: "School of Management & Commerce", label: "School of Management & Commerce (Fintech, Supply Chain)" },
  { value: "School of Law", label: "School of Law (Cyber Law, AI Regulation)" },
  { value: "School of Liberal Arts & Humanities", label: "School of Liberal Arts & Humanities (Digital Humanities)" },
];

export default function TopicAssociationsCard({ apiUrl = "http://localhost:8000/api" }: { apiUrl?: string }) {
  const [activeSubTab, setActiveSubTab] = useState<"associations" | "archetypes">("associations");
  const [selectedSchool, setSelectedSchool] = useState<string>("ALL");
  const [minSupport, setMinSupport] = useState<number>(0.04);
  const [minLift, setMinLift] = useState<number>(1.2);
  const [nClusters, setNClusters] = useState<number>(4);

  const [loadingAssoc, setLoadingAssoc] = useState<boolean>(false);
  const [assocData, setAssocData] = useState<{
    school: string;
    n_baskets: number;
    min_support: number;
    min_lift: number;
    maximal_bundles: BundleItem[];
    rules: RuleItem[];
    total_rules: number;
    total_bundles: number;
  } | null>(null);

  const [loadingArchetypes, setLoadingArchetypes] = useState<boolean>(false);
  const [archetypeData, setArchetypeData] = useState<{
    n_clusters: number;
    silhouette_score: number;
    clusters: ClusterItem[];
    cluster_rules: ClusterRule[];
  } | null>(null);

  const fetchAssociations = async (school: string, supp: number, lift: number) => {
    setLoadingAssoc(true);
    try {
      const q = new URLSearchParams({
        school,
        min_support: supp.toString(),
        min_lift: lift.toString(),
      });
      const res = await fetch(`${apiUrl}/analytics/topic-associations?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAssocData(data);
      }
    } catch (err) {
      console.error("Failed to load topic associations:", err);
    } finally {
      setLoadingAssoc(false);
    }
  };

  const fetchArchetypes = async (clusters: number) => {
    setLoadingArchetypes(true);
    try {
      const res = await fetch(`${apiUrl}/analytics/researcher-archetypes?n_clusters=${clusters}`);
      if (res.ok) {
        const data = await res.json();
        setArchetypeData(data);
      }
    } catch (err) {
      console.error("Failed to load researcher archetypes:", err);
    } finally {
      setLoadingArchetypes(false);
    }
  };

  useEffect(() => {
    fetchAssociations(selectedSchool, minSupport, minLift);
  }, [selectedSchool, minSupport, minLift]);

  useEffect(() => {
    if (activeSubTab === "archetypes" && !archetypeData) {
      fetchArchetypes(nClusters);
    }
  }, [activeSubTab, nClusters]);

  return (
    <div className="bg-[#FAF9F6] border border-stone-200 rounded-xl p-6 shadow-sm text-stone-900 font-sans my-6">
      {/* Editorial Header */}
      <div className="border-b border-stone-200 pb-4 mb-6 flex flex-wrap justify-between items-end gap-4">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-widest text-stone-500 font-semibold block mb-1">
            Data Mining & Knowledge Discovery • DMW Specification
          </span>
          <h2 className="text-2xl font-serif font-bold text-stone-900 tracking-tight">
            Association Rule Mining & Researcher Archetypes
          </h2>
          <p className="text-sm text-stone-600 mt-1 max-w-3xl">
            Subgroup-stratified <strong>FP-Growth</strong> & <strong>FP-Max</strong> publication basket mining
            combined with <strong>Ward Agglomerative Clustering</strong> and discretized trait association rules.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg border border-stone-200">
          <button
            onClick={() => setActiveSubTab("associations")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeSubTab === "associations"
                ? "bg-white text-stone-900 shadow-sm border border-stone-200 font-semibold"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Topic Associations (FP-Growth / FP-Max)
          </button>
          <button
            onClick={() => setActiveSubTab("archetypes")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeSubTab === "archetypes"
                ? "bg-white text-stone-900 shadow-sm border border-stone-200 font-semibold"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Researcher Archetypes (Agglomerative)
          </button>
        </div>
      </div>

      {/* SUB-VIEW 1: FP-GROWTH & FP-MAX ASSOCIATION RULES */}
      {activeSubTab === "associations" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-stone-50/80 border border-stone-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
                <span>School Stratification:</span>
                <select
                  value={selectedSchool}
                  onChange={(e) => setSelectedSchool(e.target.value)}
                  className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-stone-400"
                >
                  {SCHOOL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
                <span>Min Support:</span>
                <select
                  value={minSupport}
                  onChange={(e) => setMinSupport(parseFloat(e.target.value))}
                  className="bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:outline-none"
                >
                  <option value={0.02}>2% (Dense)</option>
                  <option value={0.04}>4% (Standard)</option>
                  <option value={0.06}>6% (Selective)</option>
                  <option value={0.08}>8% (High)</option>
                </select>
              </label>

              <label className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
                <span>Min Lift:</span>
                <select
                  value={minLift}
                  onChange={(e) => setMinLift(parseFloat(e.target.value))}
                  className="bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:outline-none"
                >
                  <option value={1.0}>1.0x (Independent)</option>
                  <option value={1.2}>1.2x (Positive Lift)</option>
                  <option value={1.5}>1.5x (High Association)</option>
                  <option value={2.0}>2.0x (Very Strong)</option>
                </select>
              </label>
            </div>

            <div className="text-xs text-stone-500 font-mono flex items-center gap-2">
              <span>Baskets Analyzed: <strong>{assocData?.n_baskets ?? 0}</strong></span>
              <span>•</span>
              <span>Rules Discovered: <strong>{assocData?.total_rules ?? 0}</strong></span>
            </div>
          </div>

          {loadingAssoc ? (
            <div className="py-12 text-center text-sm text-stone-500 font-serif italic">
              Mining publication baskets with FP-Growth & FP-Max algorithms...
            </div>
          ) : (
            <>
              {/* Maximal Thematic Bundles (FP-Max) Panel */}
              <div className="bg-white border border-stone-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-2">
                  <div>
                    <h3 className="text-sm font-serif font-bold text-stone-900 flex items-center gap-2">
                      <span>Maximal Thematic Bundles</span>
                      <span className="text-[10px] font-mono bg-stone-100 text-stone-600 px-2 py-0.5 rounded font-normal border border-stone-200">
                        Algorithm: FP-Max (len ≥ 2)
                      </span>
                    </h3>
                    <p className="text-xs text-stone-500">
                      Non-redundant maximal frequent itemsets representing core research clusters without subset duplication.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-stone-500">
                    {assocData?.maximal_bundles?.length ?? 0} bundles
                  </span>
                </div>

                {assocData?.maximal_bundles && assocData.maximal_bundles.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {assocData.maximal_bundles.map((bundle, idx) => (
                      <div
                        key={idx}
                        className="bg-stone-50/70 border border-stone-200 rounded-md p-3 hover:border-stone-300 transition-colors"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-stone-500 mb-2">
                          <span className="font-semibold text-stone-700">Bundle #{idx + 1}</span>
                          <span className="bg-stone-200/60 px-1.5 py-0.5 rounded text-stone-800">
                            {bundle.paper_count} papers ({bundle.support_pct}%)
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {bundle.bundle.map((item, i) => (
                            <span
                              key={i}
                              className="inline-block text-xs font-medium bg-white text-stone-800 border border-stone-200 rounded px-2 py-0.5 shadow-2xs"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-stone-500 italic py-3">
                    No multi-item maximal bundles identified at this support threshold. Try lowering the minimum support.
                  </p>
                )}
              </div>

              {/* High-Lift Association Rules Table */}
              <div className="bg-white border border-stone-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-2">
                  <div>
                    <h3 className="text-sm font-serif font-bold text-stone-900 flex items-center gap-2">
                      <span>High-Lift Topic Association Rules</span>
                      <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-normal">
                        Sorted by Lift & Conviction DESC
                      </span>
                    </h3>
                    <p className="text-xs text-stone-500">
                      Rules filtered strictly with lift ≥ {minLift} to eliminate high-confidence traps caused by ubiquitous institutional tags.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-stone-500">
                    Showing top {assocData?.rules?.length ?? 0} rules
                  </span>
                </div>

                {assocData?.rules && assocData.rules.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-500 font-mono uppercase text-[10px] tracking-wider bg-stone-50/50">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Antecedents (If saved/studied)</th>
                          <th className="py-2.5 px-3 text-center">⇒</th>
                          <th className="py-2.5 px-3">Consequents (Also saved/studied)</th>
                          <th className="py-2.5 px-3 text-right">Support</th>
                          <th className="py-2.5 px-3 text-right">Confidence</th>
                          <th className="py-2.5 px-3 text-right">Lift</th>
                          <th className="py-2.5 px-3 text-right">Conviction</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {assocData.rules.map((rule, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-2 px-3 text-stone-400 font-mono text-[11px]">{idx + 1}</td>
                            <td className="py-2 px-3">
                              <div className="flex flex-wrap gap-1">
                                {rule.antecedents.map((a, i) => (
                                  <span
                                    key={i}
                                    className="bg-stone-100 border border-stone-200 text-stone-800 rounded px-1.5 py-0.5 font-medium text-[11px]"
                                  >
                                    {a}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-stone-400 text-center font-bold">⇒</td>
                            <td className="py-2 px-3">
                              <div className="flex flex-wrap gap-1">
                                {rule.consequents.map((c, i) => (
                                  <span
                                    key={i}
                                    className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded px-1.5 py-0.5 font-medium text-[11px]"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-stone-600">
                              {(rule.support * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-medium text-stone-800">
                              {rule.confidence_pct}%
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded font-semibold text-[11px] ${
                                  rule.lift >= 2.0
                                    ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                    : rule.lift >= 1.5
                                    ? "bg-amber-100 text-amber-900 border border-amber-200"
                                    : "bg-stone-100 text-stone-800"
                                }`}
                              >
                                {rule.lift.toFixed(2)}x
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-stone-500">
                              {rule.conviction === "inf" ? "∞" : Number(rule.conviction).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-stone-500 italic py-3">
                    No association rules satisfy the minimum lift of {minLift}. Try adjusting the filters.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* SUB-VIEW 2: AGGLOMERATIVE RESEARCHER CLUSTERING & DISCRETIZED TRAITS */}
      {activeSubTab === "archetypes" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-stone-50/80 border border-stone-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
                <span>Cluster Count (k):</span>
                <select
                  value={nClusters}
                  onChange={(e) => {
                    const k = parseInt(e.target.value);
                    setNClusters(k);
                    fetchArchetypes(k);
                  }}
                  className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 font-medium focus:outline-none"
                >
                  <option value={3}>k = 3 Archetypes</option>
                  <option value={4}>k = 4 Archetypes</option>
                  <option value={5}>k = 5 Archetypes</option>
                  <option value={6}>k = 6 Archetypes</option>
                </select>
              </label>
            </div>

            <div className="text-xs text-stone-600 font-mono flex items-center gap-2">
              <span>Linkage: <strong>Ward</strong></span>
              <span>•</span>
              <span>
                Silhouette Score:{" "}
                <strong className={archetypeData?.silhouette_score && archetypeData.silhouette_score > 0.25 ? "text-emerald-700 font-bold" : "text-stone-700"}>
                  {archetypeData?.silhouette_score ?? "..."}
                </strong>
              </span>
            </div>
          </div>

          {loadingArchetypes ? (
            <div className="py-12 text-center text-sm text-stone-500 font-serif italic">
              Standardizing metrics, computing Ward Agglomerative Clusters & mining trait rules...
            </div>
          ) : (
            <>
              {/* Cluster Archetype Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {archetypeData?.clusters?.map((cluster) => (
                  <div
                    key={cluster.cluster_id}
                    className="bg-white border border-stone-200 rounded-lg p-4 shadow-2xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                      <div>
                        <span className="text-[10px] font-mono uppercase bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded border border-stone-200">
                          {cluster.cluster_id}
                        </span>
                        <h4 className="text-base font-serif font-bold text-stone-900 mt-1">
                          {cluster.archetype_title}
                        </h4>
                      </div>
                      <span className="text-xs font-mono font-semibold bg-stone-100 text-stone-800 px-2 py-1 rounded">
                        {cluster.size} researchers ({cluster.percentage}%)
                      </span>
                    </div>

                    {/* Metric Averages */}
                    <div className="grid grid-cols-3 gap-2 text-center bg-stone-50/60 p-2 rounded border border-stone-100 text-[11px] font-mono">
                      <div>
                        <span className="text-stone-400 block text-[9px] uppercase">Avg Pubs</span>
                        <span className="font-bold text-stone-800">{cluster.mean_metrics.total_publications}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[9px] uppercase">Avg Citations</span>
                        <span className="font-bold text-stone-800">{cluster.mean_metrics.total_citations}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[9px] uppercase">Topic Breadth</span>
                        <span className="font-bold text-stone-800">{cluster.mean_metrics.topic_breadth}</span>
                      </div>
                    </div>

                    {/* Mined Prominent Traits */}
                    {cluster.prominent_traits.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase font-mono text-stone-400 block mb-1">
                          Discretized High-Lift Traits (FP-Growth):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {cluster.prominent_traits.map((trait, i) => (
                            <span
                              key={i}
                              className="text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded"
                            >
                              {trait.replace("_", " ")}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Cluster Trait Association Rules Table */}
              <div className="bg-white border border-stone-200 rounded-lg p-4">
                <div className="mb-3 border-b border-stone-100 pb-2">
                  <h3 className="text-sm font-serif font-bold text-stone-900">
                    Cluster Trait Profile Rules (FP-Growth on Tertile Discretization)
                  </h3>
                  <p className="text-xs text-stone-500">
                    Association rules where consequents identify <code>Cluster_&lt;id&gt;</code> with lift &gt; 1.1, revealing the distinctive behavioral signature of each archetype.
                  </p>
                </div>

                {archetypeData?.cluster_rules && archetypeData.cluster_rules.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-500 font-mono uppercase text-[10px] bg-stone-50/50">
                          <th className="py-2 px-3">Target Cluster</th>
                          <th className="py-2 px-3">Discretized Behavioral Traits (Antecedents)</th>
                          <th className="py-2 px-3 text-right">Support</th>
                          <th className="py-2 px-3 text-right">Confidence</th>
                          <th className="py-2 px-3 text-right">Lift</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {archetypeData.cluster_rules.map((cRule, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-2 px-3 font-mono font-semibold text-stone-800">
                              <span className="bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                                {cRule.cluster}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex flex-wrap gap-1">
                                {cRule.traits.map((t, i) => (
                                  <span
                                    key={i}
                                    className="bg-stone-100 text-stone-800 border border-stone-200 px-1.5 py-0.5 rounded text-[11px]"
                                  >
                                    {t.replace("_", " ")}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-stone-600">
                              {(cRule.support * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-stone-800 font-medium">
                              {(cRule.confidence * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-800">
                              {cRule.lift.toFixed(2)}x
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-stone-500 italic py-3">
                    No archetype trait rules found above threshold.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
