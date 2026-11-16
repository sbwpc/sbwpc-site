// The Help tab at the top of the Studio: the how-to videos for the SBWPC website.
import {definePlugin} from 'sanity'
import {route} from 'sanity/router'
import {HelpCircleIcon} from '@sanity/icons/HelpCircle'
import {HelpTool} from './HelpTool.jsx'
import {HelpEvents} from './WatchHow.jsx'

export const helpTool = definePlugin({
  name: 'sbwpc-help',
  tools: [{name: 'help', title: 'Help', icon: HelpCircleIcon, component: HelpTool, router: route.create('/', [route.create('/:video')])}],
  studio: {components: {layout: HelpEvents}},
})
