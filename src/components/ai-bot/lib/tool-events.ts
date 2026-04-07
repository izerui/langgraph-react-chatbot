export type ToolEventState = 'start' | 'running' | 'completed' | 'error' | 'interrupted'

export type ToolEventPhase =
  | 'tool_call_started'
  | 'tool_args_streaming'
  | 'tool_call_finished'
  | 'tool_result'

export interface ToolEventPayload {
  phase: ToolEventPhase
  id?: string
  name?: string
  args?: string
  result?: string
  state: ToolEventState
}
