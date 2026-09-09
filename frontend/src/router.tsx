import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "./layout/MainLayout";
import { RequireAuth, RequireRole } from "./components/RouteGuards";
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
import { ProfilePasswordPage } from "./pages/ProfilePassword";
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
      {
        path: "tasks/new",
        element: (
          <RequireRole role="company">
            <TasksCreatePage />
          </RequireRole>
        )
      },
      { path: "tasks/:taskId", element: <TaskDetailPage /> },
      {
        path: "tasks/:taskId/chat",
        element: (
          <RequireAuth>
            <TaskChatPage />
          </RequireAuth>
        )
      },
      { path: "ideas", element: <IdeasPage /> },
      {
        path: "ideas/new",
        element: (
          <RequireAuth>
            <IdeasCreatePage />
          </RequireAuth>
        )
      },
      { path: "ideas/:ideaId", element: <IdeaDetailPage /> },
      {
        path: "projects",
        element: (
          <RequireAuth>
            <ProjectsPage />
          </RequireAuth>
        )
      },
      {
        path: "projects/:projectId",
        element: (
          <RequireAuth>
            <ProjectDetailPage />
          </RequireAuth>
        )
      },
      {
        path: "projects/:projectId/chat",
        element: (
          <RequireAuth>
            <ProjectChatPage />
          </RequireAuth>
        )
      },
      // Свой профиль
      {
        path: "profile",
        element: (
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        )
      },
      // Публичный профиль другого пользователя
      {
        path: "profile/:userId",
        element: (
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        )
      },
      // Остальные подстраницы профиля (если они есть)
      {
        path: "profile/account",
        element: (
          <RequireAuth>
            <ProfileAccountPage />
          </RequireAuth>
        )
      },
      {
        path: "profile/details",
        element: (
          <RequireAuth>
            <ProfileDetailsPage />
          </RequireAuth>
        )
      },
      {
        path: "profile/avatar",
        element: (
          <RequireAuth>
            <ProfileAvatarPage />
          </RequireAuth>
        )
      },
      {
        path: "profile/password",
        element: (
          <RequireAuth>
            <ProfilePasswordPage />
          </RequireAuth>
        )
      },
      { path: "*", element: <NotFoundPage /> }
    ]
  }
]);