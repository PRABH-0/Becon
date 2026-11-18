export interface ActionGuidance {
  action_type: "learn" | "apply" | "avoid" | "prepare";
  guidance: string;
}

export interface DeepDetail {
  full_description?: string;
  code_snippet?: {
    language: string;
    code: string;
  };
  has_visual_diagram?: boolean;
  diagram_title?: string;
}

export interface BriefingCardContent {
  what_happened: string[];
  why_it_matters: string;
  how_it_affects_you: string;
  what_to_do_next: ActionGuidance;
}

export interface BriefingCard {
  id: string;
  rank?: number;
  title: string;
  source_url: string;
  image_url?: string;
  is_real_image?: boolean;
  published_at?: string;
  target_role: string;
  target_stack: string[];
  priority?: "lead" | "major" | "brief" | "watch" | "spotlight";
  card_content: BriefingCardContent;
  deep_detail?: DeepDetail;
}
