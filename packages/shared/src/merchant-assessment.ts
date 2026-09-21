export interface SavedMerchantAssessment {
 id:string; modelId:string; modelVersion:string; stage:string; score:number|null;
 evidenceWindow:{from:string;to:string;days:number}; passedRequirements:string[]; missingRequirements:string[];
 reliability:Record<string,unknown>; sourceCoverage:Record<string,unknown>; limitations:string[]; disclaimer:string;
 businessProfile:Record<string,unknown>; createdAt:string; actorUserId:string;
}
