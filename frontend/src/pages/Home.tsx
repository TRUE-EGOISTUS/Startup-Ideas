import { useEffect, useMemo, useState } from "react";
import { Button, Empty, Spin } from "antd";
import { Link } from "react-router-dom";
import "./Home.css";
import { api } from "../lib/api";
import type { Task } from "../types";

export function HomePage() {
  const [mode, setMode] = useState<"seekers" | "employers">("seekers");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchTasks = async (search?: string) => {
    setLoadingTasks(true);
    try {
      const { data } = await api.get<Task[]>("/tasks", {
        params: { search: search || undefined }
      });
      const openTasks = data.filter((task) => task.status !== "closed");
      setTasks(openTasks);
    } catch {
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const popularTasks = useMemo(() => tasks.slice(0, 3), [tasks]);
  const skillsBuckets = useMemo(() => {
    const buckets = new Map<string, Task[]>();
    tasks.forEach((task) => {
      if (!task.required_skills) {
        return;
      }
      const skills = task.required_skills.split(",").map((skill) => skill.trim()).filter(Boolean);
      skills.forEach((skill) => {
        const list = buckets.get(skill) ?? [];
        list.push(task);
        buckets.set(skill, list);
      });
    });
    return Array.from(buckets.entries()).slice(0, 3);
  }, [tasks]);

  return (
    <div className="home-page">
      <section className="home-hero">
        <div>
          <p className="home-eyebrow">ПЛАТФОРМА ОПЫТА И КОМАНД ДЛЯ СТАРТАПОВ</p>
          <h1 className="home-eyes">От первой задачи до своей команды</h1>
          <p className="home-lead">
            Выполняй небольшие задачи, чтобы получить первый опыт и подтверждённые навыки, а затем
            используй репутацию, чтобы присоединиться к команде или собрать свою. Компании находят
            джунов ещё до найма, а стартаперы — партнёров с проверенными скиллами.
          </p>
          <div className="home-hero-actions">
            <Button type="primary" className="home-hero-button">
              <Link to="/ideas">Найти идею</Link>
            </Button>
            <Button type="default" className="home-hero-button_secondary">
              <Link to="/projects">Присоединиться к проекту</Link>
            </Button>
          </div>
        </div>
        <div className="home-banner" aria-hidden="true">
          <div className="home-banner-card">
            <div className="home-banner-title">Путь на платформе</div>
            <div className="home-banner-meta">От первой задачи до своей команды</div>
            <div className="home-banner-grid">
              <div className="home-stage">
                <span className="home-stage-title">Задачи</span>
                <span className="home-stage-label">Решай реальные задачи</span>
              </div>
              <div className="home-stage">
                <span className="home-stage-title">Навыки</span>
                <span className="home-stage-label">Подтверждай свой опыт</span>
              </div>
              <div className="home-stage">
                <span className="home-stage-title">Команда</span>
                <span className="home-stage-label">Присоединяйся или собирай свою</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-toggle" aria-label="Переключатель контента">
        <button
          type="button"
          className={mode === "seekers" ? "is-active" : "is-default"}
          onClick={() => setMode("seekers")}
        >
          Соискателям
        </button>
        <button
          type="button"
          className={mode === "employers" ? "is-active" : "is-default"}
          onClick={() => setMode("employers")}
        >
          Работодателям
        </button>
      </section>

      <section className="home-search" aria-label="Поиск">
        <div className="home-search-box">
          <input
            type="text"
            placeholder="Поиск задач, ролей, навыков"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setMode("seekers");
              fetchTasks(searchTerm);
            }}
          >
            Поиск
          </button>
        </div>
        <div className="home-search-hints">
          <span>Примеры: Product Designer, React, финтех</span>
        </div>
      </section>

      <section className="home-section" id="popular">
        <div>
          <h2>Популярное</h2>
          <p>Самые востребованные задачи и специалисты этой недели</p>
        </div>

        {mode === "seekers" ? (
          <div className="home-grid">
            {loadingTasks && (
              <div className="home-loading">
                <Spin />
              </div>
            )}
            {popularTasks.length === 0 && !loadingTasks && (
              <div className="home-empty">
                <Empty description="Нет доступных задач" />
              </div>
            )}
            {popularTasks.map((task) => (
              <Link className="home-card-link" to={`/tasks/${task.id}`} key={task.id}>
                <article className="home-card">
                  <span className="home-tag">{task.execution_mode || "classic"}</span>
                  <h3>{task.title}</h3>
                  <p>{task.description || "Описание отсутствует"}</p>
                  <div className="home-card-meta">Награда: {task.reward ?? "-"}</div>
                </article>
              </Link>
            ))}
          </div>
        ) : (
          <div className="home-grid">
            <div className="home-empty">
              <Empty description="Популярные профили специалистов появятся позже" />
            </div>
          </div>
        )}
      </section>

      <section className="home-section" id="skills">
        <div>
          <h2>Задачи по навыкам</h2>
          <p>Подборки по направлениям для быстрого старта</p>
        </div>

        {mode === "seekers" ? (
          <div className="home-grid">
            {loadingTasks && (
              <div className="home-loading">
                <Spin />
              </div>
            )}
            {skillsBuckets.length === 0 && !loadingTasks && (
              <div className="home-empty">
                <Empty description="Нет задач с указанными навыками" />
              </div>
            )}
            {skillsBuckets.map(([skill, skillTasks]) => (
              <article className="home-skill-card" key={skill}>
                <div className="home-skill-title">{skill}</div>
                <p>{skillTasks[0]?.title || "Задачи по навыку"}</p>
                <div className="home-pill-row">
                  <span className="home-pill">{skillTasks.length} задач</span>
                  <span className="home-pill">Средняя награда {Math.round(skillTasks.reduce((acc, task) => acc + (task.reward ?? 0), 0) / Math.max(skillTasks.length, 1)) || 0}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="home-grid">
            <div className="home-empty">
              <Empty description="Списки специалистов появятся после добавления API" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
