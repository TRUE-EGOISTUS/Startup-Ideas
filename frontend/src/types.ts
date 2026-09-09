export type Task = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  author_id: number;
  author_email?: string | null;
  reward?: number | null;
  deadline?: string | null;
  visibility?: string | null;
  execution_mode?: string | null;
  required_skills?: string | null;
  difficulty?: string | null;
  assigned_to_id?: number | null;
  current_executor_deadline?: string | null;
  responses?: TaskResponse[];
  executions?: TaskExecution[];
};

export type TaskResponse = {
  id: number;
  task_id: number;
  user_id: number;
  user_nickname?: string | null;
  message?: string | null;
  status: string;
  created_at: string;
};

export type TaskExecution = {
  id: number;
  task_id: number;
  user_id: number;
  user_nickname?: string | null;
  solution_url?: string | null;
  comment?: string | null;
  feedback?: string | null;
  rating?: number | null;
  status: string;
  created_at: string;
};

export type Idea = {
  id: number;
  title: string;
  short_description: string;
  author_id: number;
  author_email?: string | null;
  roles_needed?: string | null;
  tags?: string | null;
  status: string;
  created_at: string;
};

export type IdeaResponse = {
  id: number;
  idea_id: number;
  user_id: number;
  role: string;
  message?: string | null;
  status: string;
  created_at: string;
};

export type Project = {
  id: number;
  name: string;
  description?: string | null;
  idea_id?: number | null;
  created_by: number;
  creator_email?: string | null;
  created_at: string;
};

export type ProjectMember = {
  id: number;
  project_id: number;
  user_id: number;
  role?: string | null;
  joined_at: string;
};

export type Message = {
  id: number;
  task_id?: number;
  project_id?: number;
  user_id: number;
  text: string;
  created_at: string;
  sender_name?: string | null;
};

export type PublicUser = {
  id: number;
  email: string;
  role: 'specialist' | 'company';
  username: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  specialist_profile?: {
    id: number;
    user_id: number;
    skills: string | null;
    rating: number;
    github_url: string | null;
    portfolio: string | null;
    avatar_url: string | null;
    cover_url: string | null;
  } | null;
  company_profile?: {
    id: number;
    user_id: number;
    company_name: string | null;
    description: string | null;
    logo_url: string | null;
    cover_url: string | null;
    contact_info: string | null;
  } | null;
};