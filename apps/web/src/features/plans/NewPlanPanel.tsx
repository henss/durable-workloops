import { Alert, Button, Group, Paper, Stack, Switch, Text, Textarea, Title } from "@mantine/core";
import { FilePlus2, Info } from "lucide-react";
import { useMemo } from "react";

export function NewPlanPanel(props: {
  draft: string;
  approvalRequired: boolean;
  errorMessage: string | null;
  isSubmitting: boolean;
  onDraftChange: (draft: string) => void;
  onApprovalRequiredChange: (value: boolean) => void;
  onSubmit: () => void;
}) {
  const canSubmit = useMemo(() => props.draft.trim().length > 0 && !props.isSubmitting, [props.draft, props.isSubmitting]);
  return (
    <Paper className="section-panel" p="lg" data-testid="new-plan-panel">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={2}>Manual WorkLoop Plan</Title>
            <Text size="sm" c="dimmed">
              A plan is one unit of agent work: an objective, success criteria, slices, and policies that an executor can run.
            </Text>
          </Stack>
          <Switch
            checked={props.approvalRequired}
            onChange={(event) => props.onApprovalRequiredChange(event.currentTarget.checked)}
            label="Require human approval before execution"
            description="Approved plans become ready to claim. Approval-free plans skip directly to the executor queue."
            aria-label="Require human approval before execution"
          />
        </Group>
        <Alert icon={<Info size={16} />} title="What happens after submission">
          <Text size="sm">
            Paste either a WorkLoop object or a submit request with a workLoop field. If approval is required, the plan enters Pending Approval. If approval is not required, it becomes Ready to Claim for an executor.
          </Text>
        </Alert>
        {props.errorMessage ? (
          <Alert color="red" title="Plan submission failed">
            {props.errorMessage}
          </Alert>
        ) : null}
        <Textarea
          label="WorkLoop plan JSON or YAML"
          description="Use public-safe, synthetic examples only. Required fields include id, projectId, source, objective, successCriteria, slices, and completionPolicy."
          aria-label="WorkLoop plan JSON or YAML"
          data-testid="new-plan-draft"
          minRows={18}
          autosize
          spellCheck={false}
          value={props.draft}
          onChange={(event) => props.onDraftChange(event.currentTarget.value)}
          placeholder={`id: example-loop
projectId: public-demo
source: manual
objective: Describe the agent work to run
successCriteria:
  - The expected outcome is clear
slices:
  - id: slice-1
    title: First executable step
completionPolicy:
  defaultAction: continue
  stopOnlyFor:
    - done`}
        />
        <Group justify="flex-end">
          <Button
            leftSection={<FilePlus2 size={16} />}
            disabled={!canSubmit}
            loading={props.isSubmitting}
            aria-label="Submit WorkLoop plan"
            data-testid="submit-new-plan"
            onClick={props.onSubmit}
          >
            Submit Plan
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
