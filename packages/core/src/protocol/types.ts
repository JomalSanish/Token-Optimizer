import { z } from "zod";
import * as schemas from "./schemas.js";

// ─── Primitive / Helper Types ───────────────────────────────────────────────

export type ISO8601 = z.infer<typeof schemas.ISO8601Schema>;
export type ModelId = z.infer<typeof schemas.ModelIdSchema>;
export type ProviderId = z.infer<typeof schemas.ProviderIdSchema>;
export type StrategyId = z.infer<typeof schemas.StrategyIdSchema>;
export type PhaseId = z.infer<typeof schemas.PhaseIdSchema>;

// ─── Domain Entity Types ───────────────────────────────────────────────────

export type ConfirmedPhase = z.infer<typeof schemas.ConfirmedPhaseSchema>;
export type TechStackEntry = z.infer<typeof schemas.TechStackEntrySchema>;
export type ComponentEntry = z.infer<typeof schemas.ComponentEntrySchema>;
export type ProjectProfile = z.infer<typeof schemas.ProjectProfileSchema>;
export type Provider = z.infer<typeof schemas.ProviderSchema>;
export type Model = z.infer<typeof schemas.ModelSchema>;
export type Pricing = z.infer<typeof schemas.PricingSchema>;
export type Phase = z.infer<typeof schemas.PhaseSchema>;
export type SavingsRange = z.infer<typeof schemas.SavingsRangeSchema>;
export type Strategy = z.infer<typeof schemas.StrategySchema>;
export type Platform = z.infer<typeof schemas.PlatformSchema>;
export type PromptTemplate = z.infer<typeof schemas.PromptTemplateSchema>;
export type ExplainNode = schemas.ExplainNodeData;
export type TokenBreakdown = z.infer<typeof schemas.TokenBreakdownSchema>;
export type CostRange = z.infer<typeof schemas.CostRangeSchema>;
export type PhaseResult = z.infer<typeof schemas.PhaseResultSchema>;
export type TrackResult = z.infer<typeof schemas.TrackResultSchema>;
export type EstimationResult = z.infer<typeof schemas.EstimationResultSchema>;
export type EditProposal = z.infer<typeof schemas.EditProposalSchema>;
export type PhaseOverride = z.infer<typeof schemas.PhaseOverrideSchema>;

// ─── Host -> Webview Messages ───────────────────────────────────────────────

export type CatalogUpdatedMsg = z.infer<typeof schemas.CatalogUpdatedMsgSchema>;
export type KeySavedMsg = z.infer<typeof schemas.KeySavedMsgSchema>;
export type KeyErrorMsg = z.infer<typeof schemas.KeyErrorMsgSchema>;
export type KeyRemovedMsg = z.infer<typeof schemas.KeyRemovedMsgSchema>;
export type AuthStateMsg = z.infer<typeof schemas.AuthStateMsgSchema>;
export type EnhanceStreamMsg = z.infer<typeof schemas.EnhanceStreamMsgSchema>;
export type EnhanceResultMsg = z.infer<typeof schemas.EnhanceResultMsgSchema>;
export type EnhanceErrorMsg = z.infer<typeof schemas.EnhanceErrorMsgSchema>;
export type ProfileFinalizedMsg = z.infer<typeof schemas.ProfileFinalizedMsgSchema>;
export type PhasesUpdatedMsg = z.infer<typeof schemas.PhasesUpdatedMsgSchema>;
export type EstimateResultMsg = z.infer<typeof schemas.EstimateResultMsgSchema>;
export type StrategySelectionMsg = z.infer<typeof schemas.StrategySelectionMsgSchema>;
export type SavingsUpdateMsg = z.infer<typeof schemas.SavingsUpdateMsgSchema>;
export type GenerateProgressMsg = z.infer<typeof schemas.GenerateProgressMsgSchema>;
export type GenerateCompleteMsg = z.infer<typeof schemas.GenerateCompleteMsgSchema>;
export type ImplementPlanMsg = z.infer<typeof schemas.ImplementPlanMsgSchema>;
export type ApplyProgressMsg = z.infer<typeof schemas.ApplyProgressMsgSchema>;
export type ApplyProposalsMsg = z.infer<typeof schemas.ApplyProposalsMsgSchema>;
export type ApplyCompleteMsg = z.infer<typeof schemas.ApplyCompleteMsgSchema>;
export type HandoffPreviewMsg = z.infer<typeof schemas.HandoffPreviewMsgSchema>;
export type HandoffResultMsg = z.infer<typeof schemas.HandoffResultMsgSchema>;
export type HostCancelledMsg = z.infer<typeof schemas.HostCancelledMsgSchema>;

export type HostToWebviewMsg = z.infer<typeof schemas.HostToWebviewMsgSchema>;

// ─── Webview -> Host Messages ───────────────────────────────────────────────

export type WebviewReadyMsg = z.infer<typeof schemas.WebviewReadyMsgSchema>;
export type SaveKeyMsg = z.infer<typeof schemas.SaveKeyMsgSchema>;
export type RemoveKeyMsg = z.infer<typeof schemas.RemoveKeyMsgSchema>;
export type SetEnabledModelsMsg = z.infer<typeof schemas.SetEnabledModelsMsgSchema>;
export type SetPlatformMsg = z.infer<typeof schemas.SetPlatformMsgSchema>;
export type SetEnhanceModelMsg = z.infer<typeof schemas.SetEnhanceModelMsgSchema>;
export type SetCopilotOnlyMsg = z.infer<typeof schemas.SetCopilotOnlyMsgSchema>;
export type EnhanceRunMsg = z.infer<typeof schemas.EnhanceRunMsgSchema>;
export type FinalizeProfileMsg = z.infer<typeof schemas.FinalizeProfileMsgSchema>;
export type EditPhasesMsg = z.infer<typeof schemas.EditPhasesMsgSchema>;
export type EstimateRequestMsg = z.infer<typeof schemas.EstimateRequestMsgSchema>;
export type StrategySetMsg = z.infer<typeof schemas.StrategySetMsgSchema>;
export type OptimizeGenerateMsg = z.infer<typeof schemas.OptimizeGenerateMsgSchema>;
export type ImplementStartMsg = z.infer<typeof schemas.ImplementStartMsgSchema>;
export type ApplyAcceptMsg = z.infer<typeof schemas.ApplyAcceptMsgSchema>;
export type HandoffConfirmMsg = z.infer<typeof schemas.HandoffConfirmMsgSchema>;
export type WebviewCancelMsg = z.infer<typeof schemas.WebviewCancelMsgSchema>;

export type WebviewToHostMsg = z.infer<typeof schemas.WebviewToHostMsgSchema>;
