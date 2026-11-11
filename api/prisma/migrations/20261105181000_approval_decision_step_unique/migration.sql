-- One decision per approval step: a concurrent double-click could previously record two decisions for the same
-- stepOrder and advance the instance twice, i.e. approve a document with fewer approvals than the chain requires.
CREATE UNIQUE INDEX "ApprovalDecision_instanceId_stepOrder_key" ON "ApprovalDecision"("instanceId", "stepOrder");
