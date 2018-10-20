import ko from 'knockout'
import { htmlDecode } from 'htmlencode'

const ajax = require('../../get-api-data')
const browser = require('../../browser')
const endpoints = require('../../api')
const location = require('../../location/locationSelector')
const proximityRanges = require('../../location/proximityRanges')
const getDistanceApart = require('../../location/getDistanceApart')

function OrgListing (orgsFilter = null, pageSize = 8) {
  const self = this

  self.orgsFilter = orgsFilter
  self.pageSize = pageSize
  self.pageIndex = ko.observable(self.pageSize)

  self.postcode = ko.observable()
  self.range = ko.observable(10000)
  self.ranges = ko.observableArray(proximityRanges.ranges)
  self.searchQuery = ko.observable()
  self.organisations = ko.observableArray()
  self.orgsToDisplay = ko.observableArray()

  self.currentSort = ko.observable()

  self.postcodeRetrievalIssue = ko.observable(false)

  self.hasOrgs = ko.computed(() => self.organisations().length > 0, self)
  self.hasPrevPages = ko.computed(() => self.pageIndex() > 0, self)
  self.hasMorePages = ko.computed(() => self.pageIndex() < self.organisations().length, self)
  self.isSortedAToZ = ko.computed(() => self.currentSort() === 'atoz', self)
  self.isSortedNearest = ko.computed(() => self.currentSort() === 'nearest', self)

  const paginate = function () {
    self.orgsToDisplay(self.organisations().slice(0, self.pageIndex()))
  }

  self.prevPage = function () {
    self.pageIndex(self.pageIndex() - self.pageSize)
    paginate()
  }

  self.nextPage = function () {
    self.pageIndex(self.pageIndex() + self.pageSize)
    paginate()
  }

  self.loadMore = function () {
    self.pageIndex(self.pageIndex() + self.pageSize)
    paginate()
  }

  const sortAlphabetical = function (a, b) {
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return 0
  }

  const sortByDistanceAway = function (a, b) {
    if (a.distanceInMetres < b.distanceInMetres) return -1
    if (a.distanceInMetres > b.distanceInMetres) return 1
    return 0
  }

  self.sortAToZ = function () {
    self.organisations(self.organisations().sort(sortAlphabetical))
    self.currentSort('atoz')
    paginate()
  }

  self.sortNearest = function () {
    self.organisations(self.organisations().sort(sortByDistanceAway))
    self.currentSort('nearest')
    paginate()
  }

  self.search = function () {
    location.setPostcode(
      self.postcode(),
      (currentLocation) => {
        loadOrgsForName(self.searchQuery().toLowerCase(), currentLocation)
      }, (err) => {
        console.log(err)
        browser.redirect('/500')
      })
  }

  self.getByPostcode = function () {
    location.setPostcode(
      self.postcode(),
      (newLocation) => {
        if (newLocation !== undefined) {
          self.postcodeRetrievalIssue(false)
          loadOrgsForLocation(newLocation)
        } else {
          self.postcodeRetrievalIssue(true)
        }
      },
      (error) => {
        console.log({error})
        self.postcodeRetrievalIssue(true)
      })
  }

  const groupByOrg = function (orgLocations, currLocation) {
    const orgs = orgLocations
      .reduce((acc, next) => {
        const { distanceInMetres, description } = getDistanceApart(
          { latA: next.latitude, longA: next.longitude },
          { latB: currLocation.latitude, longB: currLocation.longitude },
          'km'
        )
        next.distanceInMetres = distanceInMetres
        next.distanceDescription = description
        const existing = acc.find((o) => o.key === next.serviceProviderKey)
        if (existing) {
          existing.locations.push(next)
        } else {
          acc.push({
            key: next.serviceProviderKey,
            name: htmlDecode(next.serviceProviderName),
            synopsis: htmlDecode(next.serviceProviderSynopsis),
            href: `/find-help/organisation?organisation=${next.serviceProviderKey}`,
            donationUrl: next.donationUrl,
            donationDescription: next.donationDescription,
            itemDonationDescription: next.itemDonationDescription,
            needCategories: next.needCategories,
            locations: [
              next
            ]
          })
        }
        return acc
      }, [])
    orgs.forEach((o) => {
      const nearestOrgLocation = o.locations.sort(sortByDistanceAway)[0]
      o.distanceInMetres = nearestOrgLocation.distanceInMetres
      o.distanceDescription = nearestOrgLocation.distanceDescription
    })
    return orgs
  }

  const loadOrgsForName = function (name, currentLocation) {
    browser.loading()
    ajax
    .data(`${endpoints.serviceProviderLocations}?providerName=${name}`)
    .then((result) => {
      const orgs = groupByOrg(result.data.items, currentLocation)
      self.organisations(orgs)
      paginate()
      browser.loaded()
    })
    .catch(err => {
      console.log(err)
      browser.redirect('/500')
    })
  }

  const loadOrgsForLocation = function (location) {
    browser.loading()
    ajax
      .data(`${endpoints.serviceProviderLocations}?pageSize=1000&latitude=${location.latitude}&longitude=${location.longitude}&range=${self.range()}`)
      .then((result) => {
        const orgs = groupByOrg(result.data.items, location)
        self.organisations(self.orgsFilter
          ? orgs.filter(self.orgsFilter)
          : orgs)
        self.sortNearest()
        paginate()
        browser.loaded()
      }, (_) => {
        browser.redirect('/500')
      })
  }

  const init = function (location) {
    self.postcode(location.postcode)

    loadOrgsForLocation(location)
  }

  location.getPreviouslySetPostcode()
    .then((result) => {
      init(result)
    }, (err) => {
      console.log(err)
      browser.redirect('/500')
    })
}

module.exports = OrgListing
