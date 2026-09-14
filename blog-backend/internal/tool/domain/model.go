package domain

type ToolRiskLevel string

const (
	ToolRiskRead    ToolRiskLevel = "read"
	ToolRiskPropose ToolRiskLevel = "propose"
	ToolRiskWrite   ToolRiskLevel = "write"
)
