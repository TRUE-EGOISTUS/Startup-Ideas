import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "./layout/MainLayout";
import { HomePage } from "./pages/Home";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { TasksPage } from "./pages/Tasks";
import { TasksCreatePage } from "./pages/TasksCreate";
import { TaskDetailPage } from "./pages/TaskDetail";
import { TaskChatPage } from "./pages/TaskChat";
import { IdeasPage } from "./pages/Ideas";
import { IdeasCreatePage } from "./pages/IdeasCreate";
import { IdeaDetailPage } from "./pages/IdeaDetail";
import { ProjectsPage } from "./pages/Projects";
import { ProjectDetailPage } from "./pages/ProjectDetail";
import { ProjectChatPage } from "./pages/ProjectChat";
import { ProfilePage } from "./pages/Profile";
import { ProfileAccountPage } from "./pages/ProfileAccount";
import { ProfileDetailsPage } from "./pages/ProfileDetails";
import { ProfileAvatarPage } from "./pages/ProfileAvatar";
import { NotFoundPage } from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "tasks/new", element: <TasksCreatePage /> },
      { path: "tasks/:taskId", element: <TaskDetailPage /> },
      { path: "tasks/:taskId/chat", element: <TaskChatPage /> },
      { path: "ideas", element: <IdeasPage /> },
      { path: "ideas/new", element: <IdeasCreatePage /> },
      { path: "ideas/:ideaId", element: <IdeaDetailPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:projectId", element: <ProjectDetailPage /> },
      { path: "projects/:projectId/chat", element: <ProjectChatPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "profile/account", element: <ProfileAccountPage /> },
      { path: "profile/details", element: <ProfileDetailsPage /> },
      { path: "profile/avatar", element: <ProfileAvatarPage /> },
      { path: "*", element: <NotFoundPage /> }
    ]
  }
]);
