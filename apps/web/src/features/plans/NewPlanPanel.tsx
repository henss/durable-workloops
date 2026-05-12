import { Alert, Button, Group, Paper, Stack, Switch, Text, Textarea, Title } from "@mantine/core";
import { FilePlus2 } from "lucide-react";
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
    <Paper className="section-panel" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={2}>Manual WorkLoop Submission</Title>
            <Text size="sm" c="dimmed">
              Paste a public-safe WorkLoop plan or a submit request as JSON or YAML.
            </Text>
          </Stack>
          <Switch
            checked={props.approvalRequired}
            onChange={(event) => props.onApprovalRequiredChange(event.currentTarget.checked)}
            label="Require approval"
          />
        </Group>
        {props.errorMessage ? (
          <Alert color="red" title="Plan submission failed">
            {props.errorMessage}
          </Alert>
        ) : null}
        <Textarea
          aria-label="WorkLoop JSON or YAML"
          minRows={18}
          autosize
          spellCheck={false}
          value={props.draft}
          onChange={(event) => props.onDraftChange(event.currentTarget.value)}
          placeholder="id: example-loop&#10;projectId: example&#10;source: manual&#10;objective: ..."
        />
        <Group justify="flex-end">
          <Button
            leftSection={<FilePlus2 size={16} />}
            disabled={!canSubmit}
            loading={props.isSubmitting}
            onClick={props.onSubmit}
          >
            Submit Plan
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
