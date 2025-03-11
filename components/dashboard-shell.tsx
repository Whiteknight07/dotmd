"use client"

import type React from "react"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { LogOut, Menu, Moon, Settings, Sun, User } from "lucide-react"
import { useTheme } from "next-themes"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default function DashboardShell({
  children,
  user = null,
}: {
  children: React.ReactNode
  user?: any
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClientComponentClient()
  const { theme, setTheme } = useTheme()

  // Wait for component to mount to access theme
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user || !user.email) return "U"
    return user.email.charAt(0).toUpperCase()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsOpen(!isOpen)}>
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-primary"
              >
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z" />
                <path d="m8 11 4 4 4-4" />
                <path d="M12 15V7" />
              </svg>
              <span className="font-bold">MarkCollab</span>
            </Link>
          </div>
          <nav className="hidden gap-6 md:flex">
            <Link
              href="/dashboard"
              className={`text-sm font-medium transition-colors hover:text-primary ${
                pathname === "/dashboard" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard/new"
              className={`text-sm font-medium transition-colors hover:text-primary ${
                pathname === "/dashboard/new" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              New Document
            </Link>
            <Link
              href="/dashboard/shared"
              className={`text-sm font-medium transition-colors hover:text-primary ${
                pathname === "/dashboard/shared" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              Shared with Me
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                <span className="sr-only">Toggle theme</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatar_url || ""} alt={user?.email || "User"} />
                    <AvatarFallback>{getUserInitials()}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">Dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <div
        className={`fixed inset-0 top-16 z-50 bg-background/95 backdrop-blur-sm md:hidden ${isOpen ? "block" : "hidden"}`}
      >
        <nav className="container grid gap-6 p-6">
          <Link
            href="/dashboard"
            className={`flex items-center text-lg font-medium hover:text-primary ${
              pathname === "/dashboard" ? "text-primary" : ""
            }`}
            onClick={() => setIsOpen(false)}
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/new"
            className={`flex items-center text-lg font-medium hover:text-primary ${
              pathname === "/dashboard/new" ? "text-primary" : ""
            }`}
            onClick={() => setIsOpen(false)}
          >
            New Document
          </Link>
          <Link
            href="/dashboard/shared"
            className={`flex items-center text-lg font-medium hover:text-primary ${
              pathname === "/dashboard/shared" ? "text-primary" : ""
            }`}
            onClick={() => setIsOpen(false)}
          >
            Shared with Me
          </Link>
          <Button variant="ghost" className="justify-start px-2" onClick={handleSignOut}>
            <LogOut className="mr-2 h-5 w-5" />
            <span>Log out</span>
          </Button>
        </nav>
      </div>
      <main className="flex-1">
        <div className="container grid gap-6 px-4 py-6 md:gap-8 md:px-6 md:py-8">{children}</div>
      </main>
    </div>
  )
}

