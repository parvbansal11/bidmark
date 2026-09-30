import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AppLayout, roleBase } from '@/layouts/AppLayout'
import { ErrorState, Loading } from '@/features/workspace/ui'
import type { UserRole } from '@/types'
import { LoginPage } from '@/pages/LoginPage'
import { OfficerHome, QueuePage, TendersPage, TenderPage, IntelligencePage } from '@/features/workspace/OfficerPages'
import { OversightHome, RulesPage, UsersPage, AdminTenderPage, SellerHome, SellerBids, SellerTenders, SellerDocuments, SellerTender, SellerCasePage, SellerProfile } from '@/features/workspace/RolePages'
import { AuditPage } from '@/features/bidmark/AuditView'
const CasePage=lazy(()=>import('@/features/bidmark/CasePage'))
export const ADMIN_ONLY:UserRole[]=['ADMIN'],BIDDER_ONLY:UserRole[]=['BIDDER'],OFFICER_AND_ADMIN:UserRole[]=['PROCUREMENT_OFFICER','ADMIN']
export function RoleRoute({roles,children}:{roles:UserRole[];children:ReactNode}){const {user}=useAuth();if(!user)return null;if(!roles.includes(user.role))return <Navigate to="/dashboard" replace/>;return <>{children}</>}
function Protected(){const {user,loading,sessionError,restore}=useAuth();if(loading)return <Loading label="Restoring authenticated session"/>;if(!user&&sessionError?.includes('unavailable'))return <ErrorState error={sessionError} retry={restore}/>;if(!user)return <Navigate to="/login" replace/>;return <AppLayout/>}
function HomeRedirect(){const {user}=useAuth();return <Navigate to={roleBase(user?.role)} replace/>}
export function AppRouter(){return <Suspense fallback={<Loading/>}><Routes><Route path="/login" element={<LoginPage/>}/><Route element={<Protected/>}><Route path="/" element={<HomeRedirect/>}/><Route path="/dashboard" element={<HomeRedirect/>}/>{['po','admin','auditor'].map(scope=>{const roles:UserRole[]=scope==='po'?['PROCUREMENT_OFFICER']:scope==='admin'?['ADMIN']:['AUDITOR'];const guard=(children:ReactNode)=><RoleRoute roles={roles}>{children}</RoleRoute>;return <Route key={scope} path={scope}><Route index element={guard(scope==='po'?<OfficerHome/>:<OversightHome/>)}/><Route path="queue" element={guard(<QueuePage/>)}/><Route path="cases/:id" element={guard(<CasePage/>)}/><Route path="audit" element={guard(<AuditPage/>)}/>{scope!=='auditor'&&<><Route path="tenders" element={guard(<TendersPage/>)}/><Route path="tenders/:id" element={guard(scope==='admin'?<AdminTenderPage/>:<TenderPage/>)}/></>}{scope==='po'&&<><Route path="decisions" element={guard(<QueuePage decisions/>)}/><Route path="intelligence" element={guard(<IntelligencePage/>)}/></>}{scope==='admin'&&<><Route path="users" element={guard(<UsersPage/>)}/><Route path="rules" element={guard(<RulesPage/>)}/></>}</Route>})}<Route path="bidder" element={<RoleRoute roles={BIDDER_ONLY}><SellerOutlet/></RoleRoute>}><Route index element={<SellerHome/>}/><Route path="bids" element={<SellerBids/>}/><Route path="bids/:id" element={<SellerCasePage/>}/><Route path="tenders" element={<SellerTenders/>}/><Route path="tenders/:id" element={<SellerTender/>}/><Route path="documents" element={<SellerDocuments/>}/><Route path="profile" element={<SellerProfile/>}/></Route><Route path="*" element={<div className="empty"><h1>Page not found</h1><a className="btn" href="/dashboard">Return to workspace</a></div>}/></Route></Routes></Suspense>}
import { Outlet } from 'react-router-dom'
function SellerOutlet(){return <Outlet/>}
