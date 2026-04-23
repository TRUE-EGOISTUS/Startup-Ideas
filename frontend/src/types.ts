export type Task = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  author_id: number;
  reward?: number | null;
  deadline?: string | null;
  visibility?: string | null;
  execution_mode?: string | null;
  required_skills?: string | null;
  difficulty?: string | null;
  assigned_to_id?: number | null;
  current_executor_deadline?: string | null;
  responses?: TaskResponse[];
};

export type TaskResponse = {
  id: number;
  task_id: number;
  user_id: number;
  message?: string | null;
  status: string;
  created_at: string;
};

export type TaskExecution = {
  id: number;
  task_id: number;
  user_id: number;
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
  full_description?: string | null;
  author_id: number;
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
