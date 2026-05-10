import {
  Accordion,
  Alert,
  Badge,
  Button,
  Code,
  Modal,
  MultiSelect,
  NavLink,
  Paper,
  PasswordInput,
  Progress,
  SegmentedControl,
  Select,
  Table,
  Tabs,
  TextInput,
  ThemeIcon,
  createTheme,
} from "@mantine/core";

export const appTheme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: "md",
  defaultGradient: { from: "brand.6", to: "aqua.5", deg: 135 },
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  headings: {
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    fontWeight: "750",
  },
  radius: {
    xs: "4px",
    sm: "6px",
    md: "10px",
    lg: "14px",
    xl: "18px",
  },
  colors: {
    brand: [
      "#eff6ff",
      "#d8e8ff",
      "#afcffd",
      "#83b4f8",
      "#5f9df4",
      "#3b82f6",
      "#2563eb",
      "#1d4ed8",
      "#1e40af",
      "#1e3a8a",
    ],
    aqua: [
      "#e9fbfb",
      "#ccf4f3",
      "#95e6e4",
      "#5bd5d2",
      "#31c7c4",
      "#1dbcb9",
      "#0fa8a6",
      "#0b8584",
      "#0b6a6a",
      "#0a5656",
    ],
    slate: [
      "#f8fafc",
      "#f1f5f9",
      "#e2e8f0",
      "#cbd5e1",
      "#94a3b8",
      "#64748b",
      "#475569",
      "#334155",
      "#1e293b",
      "#0f172a",
    ],
  },
  components: {
    Accordion: Accordion.extend({
      defaultProps: { radius: "md", variant: "contained" },
    }),
    Alert: Alert.extend({
      defaultProps: { radius: "md", variant: "light" },
    }),
    Badge: Badge.extend({
      defaultProps: { radius: "sm", variant: "light" },
    }),
    Button: Button.extend({
      defaultProps: { radius: "md", size: "sm" },
    }),
    Code: Code.extend({
      defaultProps: { color: "slate" },
    }),
    Modal: Modal.extend({
      defaultProps: { radius: "lg", shadow: "xl" },
    }),
    MultiSelect: MultiSelect.extend({
      defaultProps: { radius: "md", variant: "default" },
      styles: {
        input: {
          backgroundColor: "light-dark(#ffffff, #111c2d)",
          borderColor: "light-dark(#dbe5f0, #26364a)",
        },
      },
    }),
    NavLink: NavLink.extend({
      defaultProps: { color: "brand", variant: "light" },
    }),
    Paper: Paper.extend({
      defaultProps: { radius: "md", shadow: "none" },
    }),
    PasswordInput: PasswordInput.extend({
      defaultProps: { radius: "md", variant: "default" },
      styles: {
        input: {
          backgroundColor: "light-dark(#ffffff, #111c2d)",
          borderColor: "light-dark(#dbe5f0, #26364a)",
        },
      },
    }),
    Progress: Progress.extend({
      defaultProps: { radius: "xl" },
    }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: "md", color: "brand", size: "xs" },
      styles: {
        root: {
          backgroundColor: "light-dark(#f1f5f9, #111c2d)",
          border: "1px solid light-dark(#dbe5f0, #26364a)",
        },
      },
    }),
    Select: Select.extend({
      defaultProps: { radius: "md", variant: "default" },
      styles: {
        input: {
          backgroundColor: "light-dark(#ffffff, #111c2d)",
          borderColor: "light-dark(#dbe5f0, #26364a)",
        },
      },
    }),
    Table: Table.extend({
      defaultProps: { highlightOnHover: true, verticalSpacing: "sm" },
    }),
    Tabs: Tabs.extend({
      defaultProps: { color: "brand", radius: "md" },
    }),
    TextInput: TextInput.extend({
      defaultProps: { radius: "md", variant: "default" },
      styles: {
        input: {
          backgroundColor: "light-dark(#ffffff, #111c2d)",
          borderColor: "light-dark(#dbe5f0, #26364a)",
        },
      },
    }),
    ThemeIcon: ThemeIcon.extend({
      defaultProps: { radius: "md" },
    }),
  },
});
