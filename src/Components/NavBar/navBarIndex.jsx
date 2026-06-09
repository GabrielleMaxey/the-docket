/* eslint-disable react/prop-types */
import React, { useState, useEffect } from 'react';
import { IconContext } from 'react-icons/lib'
import { animateScroll as scroll } from 'react-scroll';
import { Nav, Bars, NavMenu, MobileIcon, NavLogo, NavLogoIcon, NavBarContainer } from './navbarElements';

//header video obtained from pexels.com*//

const NavBar = ({ toggle }) => {
    const [scrollNav, setScrollNav] = useState(false);
    const changeNav = () => {
        if(window.scrollY >= 5) {
            setScrollNav(true);
        } else {
            setScrollNav(false);
        }
    };
    useEffect(() => {
        window.addEventListener('scroll', changeNav);
        return () => window.removeEventListener('scroll', changeNav);
    }, []);

    const toggleHome = () => {
        scroll.scrollToTop();
        };

    return  (
<>
    <IconContext.Provider value={{ color: '#303032' }}>
        <Nav scrollNav={ scrollNav }>
            <NavBarContainer>
                <NavLogo to='/' onClick={ toggleHome }>
                    <NavLogoIcon src='/task-manager-favicon.svg' alt='' aria-hidden='true' />
                    Task Manager
                </NavLogo>
                    <MobileIcon onClick={ toggle }>
                            <Bars />
                    </MobileIcon>
                        <NavMenu />
                </NavBarContainer>
            </Nav>
        </IconContext.Provider>
</>

);
};

export default NavBar;