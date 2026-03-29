import { Routes } from '@angular/router';
import { LandingComponent } from './pages/landing/landing';
import { ScheduleComponent } from './pages/schedule/schedule';
import { PublicViewComponent } from './pages/public-view/public-view';
import { ActivateComponent } from './pages/activate/activate';
import { PremiumComponent } from './pages/premium/premium';
import { JoinComponent } from './pages/join/join';
import { MyScheduleComponent } from './pages/my-schedule/my-schedule';
import { AboutComponent } from './pages/about/about';
import { HelpComponent } from './pages/help/help';
import { HowItWorksComponent } from './pages/how-it-works/how-it-works';
import { TermsComponent } from './pages/terms/terms';
import { PrivacyComponent } from './pages/privacy/privacy';

export const routes: Routes = [
  {
    path: '',
    component: ScheduleComponent
  },
  {
    path: 'home',
    component: LandingComponent
  },
  {
    path: 's/:id',
    component: PublicViewComponent
  },
  {
    path: 'view/:id',
    component: PublicViewComponent
  },
  {
    path: 'activate',
    component: ActivateComponent
  },
  {
    path: 'premium',
    component: PremiumComponent
  },
  {
    path: 'join/:id',
    component: JoinComponent
  },
  {
    path: 'my-schedule',
    component: MyScheduleComponent
  },
  {
    path: 'about',
    component: AboutComponent
  },
  {
    path: 'help',
    component: HelpComponent
  },
  {
    path: 'how-it-works',
    component: HowItWorksComponent
  },
  {
    path: 'terms',
    component: TermsComponent
  },
  {
    path: 'privacy',
    component: PrivacyComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
