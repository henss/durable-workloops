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
    md: "8px",
    lg: "10px",
    xl: "14px",
  },
  colors: {
    brand: [
      "#edf5ff",
      "#d8e8ff",
      "#afcffd",
      "#83b4f8",
      "#5f9df4",
      "#448cef",
      "#2f7feb",
      "#236bd2",
      "#1d5ead",
      "#194f87",
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
      "#f6f8fb",
      "#e9edf4",
      "#cfd8e5",
      "#b4c0d0",
      "#9caabd",
      "#8495aa",
      "#65778d",
      "#4f6074",
      "#374457",
      "#202a37",
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
      defaultProps: { radius: "md" },
    }),
    Code: Code.extend({
      defaultProps: { color: "slate" },
    }),
    Modal: Modal.extend({
      defaultProps: { radius: "lg", shadow: "xl" },
    }),
    MultiSelect: MultiSelect.extend({
      defaultProps: { radius: "md", variant: "default" },
    }),
    NavLink: NavLink.extend({
      defaultProps: { color: "brand", variant: "light" },
    }),
    Paper: Paper.extend({
      defaultProps: { radius: "md", shadow: "xs" },
    }),
    PasswordInput: PasswordInput.extend({
      defaultProps: { radius: "md", variant: "default" },
    }),
    Progress: Progress.extend({
      defaultProps: { radius: "xl" },
    }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: "md", color: "brand" },
    }),
    Select: Select.extend({
      defaultProps: { radius: "md", variant: "default" },
    }),
    Table: Table.extend({
      defaultProps: { highlightOnHover: true, verticalSpacing: "sm" },
    }),
    Tabs: Tabs.extend({
      defaultProps: { color: "brand", radius: "md" },
    }),
    TextInput: TextInput.extend({
      defaultProps: { radius: "md", variant: "default" },
    }),
    ThemeIcon: ThemeIcon.extend({
      defaultProps: { radius: "md" },
    }),
  },
});
